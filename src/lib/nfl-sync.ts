import { deliverLiveActivities } from './live-activities';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { fetchCurrentNFLWeek, fetchEspnPregameContext, fetchEspnScoreboard, NflGame } from '@/lib/espn';
import { calculateWeeklyScores } from '@/lib/scoring';
import { getLiveScoringDecision } from '@/lib/live-scoring';
import { selectWeeklyDoubleGame } from '@/lib/double-points';
import { selectWeeklyTiebreaker } from '@/lib/tiebreaker-selection';
import { recordScheduleSafety } from '@/lib/schedule-safety';
import { oddsArePregame, recordedPregameOdds, retainAvailableOdds } from '@/lib/pregame-odds';
import {
  PRESEASON,
  REGULAR_SEASON,
  POSTSEASON,
  SeasonType,
  espnSeasonType,
  seasonTypeFromEspn,
} from '@/lib/season';

const SEASON_WEEK_COUNTS: Array<{ seasonType: SeasonType; weeks: number }> = [
  { seasonType: PRESEASON, weeks: 4 },
  { seasonType: REGULAR_SEASON, weeks: 18 },
  { seasonType: POSTSEASON, weeks: 5 },
];

type SeasonRef = {
  id: string;
  year: number;
  seasonType: string;
  isActive: boolean;
};

async function ensureSeason(
  year: number,
  seasonType: SeasonType,
  activate: boolean,
  results: string[],
): Promise<SeasonRef> {
  return prisma.$transaction(async (tx) => {
    let target = await tx.season.findUnique({
      where: {
        year_seasonType_isSandbox: { year, seasonType, isSandbox: false },
      },
    });

    if (!target) {
      target = await tx.season.create({
        data: { year, seasonType, isActive: false, isSandbox: false },
      });
    }

    if (!activate) return target;

    const currentlyActive = await tx.season.findFirst({
      where: { isActive: true, isSandbox: false },
    });
    if (currentlyActive?.id !== target.id) {
      const transitionAt = new Date();
      await tx.season.updateMany({
        where: { isSandbox: false, isActive: true, id: { not: target.id } },
        data: { isActive: false, archivedAt: transitionAt },
      });
      target = await tx.season.update({
        where: { id: target.id },
        data: { isActive: true, activatedAt: transitionAt, archivedAt: null },
      });
      await tx.seasonRollover.create({
        data: {
          fromSeasonId: currentlyActive?.id ?? null,
          toSeasonId: target.id,
          trigger: 'ESPN_SYNC',
          summary: {
            from: currentlyActive ? `${currentlyActive.year}:${currentlyActive.seasonType}` : null,
            to: `${year}:${seasonType}`,
            behavior: 'Fresh active standings; prior season retained as archive',
          },
        },
      });
      results.push(`Activated ${year} ${seasonType.toLowerCase()} season`);
    }

    return target;
  });
}

function gameData(game: NflGame) {
  return {
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    homeScoreQ1: game.homeScoreQ1,
    homeScoreQ2: game.homeScoreQ2,
    homeScoreQ3: game.homeScoreQ3,
    homeScoreQ4: game.homeScoreQ4,
    awayScoreQ1: game.awayScoreQ1,
    awayScoreQ2: game.awayScoreQ2,
    awayScoreQ3: game.awayScoreQ3,
    awayScoreQ4: game.awayScoreQ4,
    winnerTeam: game.winnerTeam,
    startTime: game.startTime,
    isFinal: game.isFinal,
    period: game.period,
    clock: game.clock,
    possession: game.possession,
    downDistance: game.downDistance,
    statusState: game.statusState,
    venue: game.venue,
    spreadLine: game.spreadLine,
    overUnder: game.overUnder,
    homeRecord: game.homeRecord,
    awayRecord: game.awayRecord,
    weather: game.weather,
    broadcast: game.broadcast,
    oddsProvider: game.oddsProvider,
    ...(game.teamStats !== null ? { teamStats: game.teamStats as unknown as Prisma.InputJsonValue } : {}),
    ...(game.boxScore !== null ? { boxScore: game.boxScore as unknown as Prisma.InputJsonValue } : {}),
  };
}

async function syncPublishedWeek(
  season: SeasonRef,
  weekNumber: number,
  espnGames: NflGame[],
  results: string[],
) {
  if (espnGames.length === 0) return null;

  const sortedGames = [...espnGames].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
  const lockTime = sortedGames[0].startTime;

  let week = await prisma.week.findFirst({
    where: { seasonId: season.id, weekNumber },
    include: { games: true },
  });

  if (!week) {
    week = await prisma.week.create({
      data: { seasonId: season.id, weekNumber, lockTime },
      include: { games: true },
    });
  } else if (!week.isFinal && week.lockTime.getTime() !== lockTime.getTime()) {
    week = await prisma.week.update({
      where: { id: week.id },
      data: { lockTime },
      include: { games: true },
    });
  }

  const existingByEspnId = new Map(
    week.games.filter((game) => game.espnGameId).map((game) => [game.espnGameId, game]),
  );
  let created = 0;

  for (const espnGame of espnGames) {
    const existing = existingByEspnId.get(espnGame.espnGameId);
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${existing.id} FOR UPDATE`;
        const current = await tx.game.findUniqueOrThrow({where:{id:existing.id}});
        await recordScheduleSafety(tx, current, espnGame);
        const pregame = oddsArePregame(espnGame) && oddsArePregame(existing);
        const snapshots = await tx.oddsSnapshot.findMany({ where: { gameId: existing.id, capturedAt: { lt: existing.startTime } }, orderBy: { capturedAt: 'desc' }, take: 1 });
        const odds = pregame ? retainAvailableOdds(espnGame, existing) : recordedPregameOdds(existing.startTime, snapshots);
        await tx.game.update({ where: { id: existing.id }, data: { ...gameData(espnGame), spreadLine: odds.spreadLine, overUnder: odds.overUnder, oddsProvider: odds.oddsProvider } });
        if (pregame && (espnGame.spreadLine != null || espnGame.overUnder != null) && (!snapshots.length || existing.spreadLine !== odds.spreadLine || existing.overUnder !== odds.overUnder)) {
          await tx.oddsSnapshot.create({ data: { gameId: existing.id, spreadLine: odds.spreadLine, overUnder: odds.overUnder, provider: odds.oddsProvider } });
        }
      });
    } else {
      const createdGame = await prisma.game.create({
        data: {
          weekId: week.id,
          espnGameId: espnGame.espnGameId,
          ...gameData(espnGame),
          ...(!oddsArePregame(espnGame) ? { spreadLine: null, overUnder: null, oddsProvider: null } : {}),
        },
      });
      if (oddsArePregame(espnGame) && (espnGame.spreadLine != null || espnGame.overUnder != null)) await prisma.oddsSnapshot.create({ data: { gameId: createdGame.id, spreadLine: espnGame.spreadLine, overUnder: espnGame.overUnder, provider: espnGame.oddsProvider } });
      created += 1;
    }
  }

  const allGames = await prisma.game.findMany({
    where: { weekId: week.id },
    orderBy: { startTime: 'asc' },
  });

  const now = Date.now();
  for (const game of allGames) {
    if (!game.espnGameId || game.isFinal || game.startTime.getTime() - now > 72 * 60 * 60 * 1000) continue;
    if (game.contextUpdatedAt && now - game.contextUpdatedAt.getTime() < 6 * 60 * 60 * 1000) continue;
    const context = await fetchEspnPregameContext(game.espnGameId);
    await prisma.game.update({ where: { id: game.id }, data: { injurySummary: context.injuries, contextUpdatedAt: new Date() } });
  }

  await deliverLiveActivities(allGames.filter(g => espnGames.some(e => e.espnGameId === g.espnGameId)).map(g => g.id));
  await selectWeeklyTiebreaker(week.id);

  await selectWeeklyDoubleGame(week.id, new Map(espnGames.map(g => [g.espnGameId, g.spreadLine])));

  if (created > 0) {
    results.push(
      `Preloaded ${season.year} ${season.seasonType.toLowerCase()} week ${weekNumber} with ${created} games`,
    );
  }

  return prisma.week.findUnique({
    where: { id: week.id },
    include: { games: true },
  });
}

async function preloadMissingSchedules(year: number, results: string[]) {
  for (const definition of SEASON_WEEK_COUNTS) {
    const season = await ensureSeason(year, definition.seasonType, false, results);
    const existingWeeks = await prisma.week.findMany({
      where: { seasonId: season.id },
      select: { weekNumber: true },
    });
    const existingNumbers = new Set(existingWeeks.map((week) => week.weekNumber));

    for (let weekNumber = 1; weekNumber <= definition.weeks; weekNumber += 1) {
      if (existingNumbers.has(weekNumber)) continue;

      const games = await fetchEspnScoreboard(
        weekNumber,
        year,
        espnSeasonType(definition.seasonType),
      );
      await syncPublishedWeek(season, weekNumber, games, results);
    }
  }
}

async function syncActiveSeasonWindow(season: SeasonRef, results: string[]) {
  // Refresh one locked/live week plus the next two pickable weeks. Once the
  // first week reaches kickoff, the fourth week naturally moves into this set.
  const weeks = await prisma.week.findMany({
    where: { seasonId: season.id, isFinal: false },
    orderBy: { weekNumber: 'asc' },
    take: 3,
  });

  for (const week of weeks) {
    const games = await fetchEspnScoreboard(
      week.weekNumber,
      season.year,
      espnSeasonType(season.seasonType),
      true,
    );
    const updatedWeek = await syncPublishedWeek(season, week.weekNumber, games, results);
    if (!updatedWeek || updatedWeek.isFinal) continue;

    const scoring = getLiveScoringDecision(updatedWeek.games);
    if (!scoring.shouldCalculate) continue;

    await calculateWeeklyScores(updatedWeek.id);
    if (!scoring.shouldFinalize) {
      results.push(
        `${season.seasonType.toLowerCase()} week ${week.weekNumber} live standings refreshed after ${scoring.finalGameCount}/${updatedWeek.games.length} final games`,
      );
      continue;
    }

    await prisma.week.update({
      where: { id: updatedWeek.id },
      data: { isFinal: true, recapVisible: true },
    });
    results.push(
      `${season.seasonType.toLowerCase()} week ${week.weekNumber} all games final — scores calculated, recap visible`,
    );
  }

  if (weeks.length > 0) {
    results.push(`Synced ${season.seasonType.toLowerCase()} weeks ${weeks.map((w) => w.weekNumber).join(', ')}`);
  }
}

export async function runNFLSync(): Promise<{ ok: boolean; results: string[]; error?: string }> {
  if (process.env.ENABLE_ESPN_DATA !== 'true') return { ok: true, results: ['External sports feed disabled; use commissioner-managed games.'] };
  const results: string[] = [];

  try {
    const current = await fetchCurrentNFLWeek();
    if (!current) {
      return { ok: true, results: ['Could not fetch current NFL week from ESPN'] };
    }

    const { year, seasonType: espnType } = current;
    const seasonType = seasonTypeFromEspn(espnType);
    if (!seasonType) {
      return {
        ok: true,
        results: [`ESPN season type ${espnType} is not supported — skipping`],
      };
    }

    const currentlyActive = await prisma.season.findFirst({
      where: { isActive: true, isSandbox: false },
    });
    const phaseOrder: Record<string, number> = { [PRESEASON]: 1, [REGULAR_SEASON]: 2, [POSTSEASON]: 3 };
    if (currentlyActive?.year === year && phaseOrder[currentlyActive.seasonType] > phaseOrder[seasonType]) {
      return {
        ok: true,
        results: [`${currentlyActive.seasonType.toLowerCase()} is active; an earlier phase will not be reactivated`],
      };
    }

    const season = await ensureSeason(year, seasonType, true, results);
    await preloadMissingSchedules(year, results);
    // Remove old random previews from all future active-season weeks, not only
    // the three-week refresh window. Historical/current published bonuses stay.
    const pendingWeeks = await prisma.week.findMany({ where: { seasonId: season.id, isFinal: false }, select: { id: true } });
    for (const pending of pendingWeeks) {
      await selectWeeklyDoubleGame(pending.id);
      await selectWeeklyTiebreaker(pending.id);
    }
    await syncActiveSeasonWindow(season, results);

    return { ok: true, results };
  } catch (error) {
    console.error('NFL sync error:', error);
    return { ok: false, results, error: String(error) };
  }
}
