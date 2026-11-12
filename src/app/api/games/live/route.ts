import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchEspnScoreboard } from '@/lib/espn';
import { isSandboxModeFromCookieHeader } from '@/lib/sandboxContext';
import { getActiveWeek } from '@/lib/getActiveContext';
import { espnSeasonType } from '@/lib/season';
import { isWeekOpenForPicks } from '@/lib/pick-window';
import { auth } from '@/lib/auth';
import { parseSandboxSituation, sandboxDisplayStatus } from '@/lib/sandbox-gamecast';
import { sandboxLiveGameStats } from '@/lib/live-game-stats';
import { bonusSpread, oddsArePregame, recordedPregameOdds } from '@/lib/pregame-odds';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const weekParam = searchParams.get('week');
    const isSandbox = isSandboxModeFromCookieHeader(request.headers.get('cookie'));

    let week;
    if (weekParam) {
      const activeSeason = await prisma.season.findFirst({
        where: isSandbox ? { isSandbox: true } : { isActive: true, isSandbox: false },
        orderBy: isSandbox ? { id: 'desc' } : undefined,
      });
      if (activeSeason) {
        week = await prisma.week.findFirst({
          where: { seasonId: activeSeason.id, weekNumber: parseInt(weekParam) },
          include: { games: { orderBy: { startTime: 'asc' }, include: { oddsSnapshots: { orderBy: { capturedAt: 'asc' } } } }, season: true },
        });
      }
    } else {
      // Get current active week
      const activeWeek = await getActiveWeek(isSandbox);
      if (activeWeek) {
        week = await prisma.week.findUnique({
          where: { id: activeWeek.id },
          include: { games: { orderBy: { startTime: 'asc' }, include: { oddsSnapshots: { orderBy: { capturedAt: 'asc' } } } }, season: true },
        });
      }
    }

    if (!week) {
      return NextResponse.json({ games: [] });
    }

    const seasonWeeks = await prisma.week.findMany({
      where: { seasonId: week.seasonId },
      select: {
        id: true,
        lockTime: true,
        isFinal: true,
        games: { select: { startTime: true } },
      },
    });
    const settings = await prisma.leagueSettings.findUnique({ where: { id: 'default' }, select: { pickWindowWeeks: true } });
    const pickWindowOpen = isSandbox
      ? week.games.some((game) => new Date() < game.startTime)
      : isWeekOpenForPicks(week.id, seasonWeeks, new Date(), settings?.pickWindowWeeks ?? 2);
    const preservedLocks = await prisma.auditLog.findMany({where:{id:{in:week.games.map(g=>`game-lock:${g.id}`)}},select:{targetId:true}});
    const lockedGameIds = new Set(preservedLocks.map(row=>row.targetId));
    const scheduleUpdates = await prisma.auditLog.findMany({where:{action:'GAME_SCHEDULE_CHANGED',targetId:{in:week.games.map(g=>g.id)}},orderBy:{createdAt:'desc'},take:5,select:{id:true,createdAt:true}});
    const serializedWeek = {
      ...week,
      lockTime: week.lockTime.toISOString(),
      pickWindowOpen,
      scheduleUpdatedAt: scheduleUpdates[0]?.createdAt ?? null,
    };

    // For sandbox mode, skip ESPN data and just return DB data
    if (isSandbox) {
      const now = new Date();
      const games = week.games.map((dbGame) => {
        const statusState = sandboxDisplayStatus(dbGame.statusState, dbGame.startTime, dbGame.isFinal, now);
        const situation = parseSandboxSituation(dbGame.sandboxSituation);
        const fallbackStats = sandboxLiveGameStats(dbGame.awayTeam, dbGame.homeTeam);
        const isLive = statusState === 'in';
        const possession = isLive ? dbGame.possession ?? dbGame.awayTeam : dbGame.possession;
        return {
          ...dbGame,
          pickLocked: lockedGameIds.has(dbGame.id),
          homeScore: isLive ? dbGame.homeScore ?? 0 : dbGame.homeScore,
          awayScore: isLive ? dbGame.awayScore ?? 0 : dbGame.awayScore,
          period: isLive ? dbGame.period ?? 1 : dbGame.period,
          clock: isLive ? dbGame.clock ?? '15:00' : dbGame.clock,
          possession,
          downDistance: isLive
            ? dbGame.downDistance ?? `${situation.shortDownDistance ?? '1st & 10'} at ${situation.possessionText ?? `${dbGame.awayTeam} 25`}`
            : dbGame.downDistance,
          shortDownDistance: situation.shortDownDistance,
          possessionText: situation.possessionText,
          yardLine: situation.yardLine,
          distance: situation.distance,
          isRedZone: situation.isRedZone,
          driveSummary: situation.driveSummary,
          lastPlayText: situation.lastPlayText,
          teamStats: situation.teamStats.length > 0 ? situation.teamStats : fallbackStats.teamStats,
          boxScore: situation.boxScore.length > 0 ? situation.boxScore : fallbackStats.boxScore,
          statusState,
          isDoubleGame: dbGame.id === week.doubleGameId,
          startTime: dbGame.startTime.toISOString(),
        };
      });
      return NextResponse.json({ games, week: serializedWeek });
    }

    // Try to get fresh ESPN data for live games
    const espnGames = await fetchEspnScoreboard(
      week.weekNumber,
      week.season.year,
      espnSeasonType(week.season.seasonType),
    );

    // Merge ESPN data with DB data
    const bonus = await prisma.auditLog.findUnique({ where: { id: `double-points:${week.id}` }, select: { details: true } });
    const games = week.games.map((dbGame) => {
      const espnGame = espnGames.find((g) => g.espnGameId === dbGame.espnGameId);
      const frozenOdds = !oddsArePregame(dbGame) || (espnGame && !oddsArePregame(espnGame))
        ? recordedPregameOdds(dbGame.startTime, dbGame.oddsSnapshots) : null;
      const bonusSelectionSpread = bonusSpread(bonus?.details, dbGame.id);
      if (espnGame && espnGame.statusState !== 'pre') {
        return {
          ...dbGame,
          pickLocked: lockedGameIds.has(dbGame.id),
          homeScore: espnGame.homeScore,
          awayScore: espnGame.awayScore,
          homeScoreQ1: espnGame.homeScoreQ1,
          homeScoreQ2: espnGame.homeScoreQ2,
          homeScoreQ3: espnGame.homeScoreQ3,
          homeScoreQ4: espnGame.homeScoreQ4,
          awayScoreQ1: espnGame.awayScoreQ1,
          awayScoreQ2: espnGame.awayScoreQ2,
          awayScoreQ3: espnGame.awayScoreQ3,
          awayScoreQ4: espnGame.awayScoreQ4,
          period: espnGame.period,
          clock: espnGame.clock,
          possession: espnGame.possession,
          downDistance: espnGame.downDistance,
          shortDownDistance: espnGame.shortDownDistance,
          possessionText: espnGame.possessionText,
          yardLine: espnGame.yardLine,
          distance: espnGame.distance,
          isRedZone: espnGame.isRedZone,
          lastPlayText: espnGame.lastPlayText,
          driveSummary: espnGame.driveSummary,
          teamStats: espnGame.teamStats ?? dbGame.teamStats,
          boxScore: espnGame.boxScore ?? dbGame.boxScore,
          statusState: espnGame.statusState,
          isFinal: espnGame.isFinal,
          winnerTeam: espnGame.winnerTeam,
          venue: espnGame.venue ?? dbGame.venue,
          spreadLine: dbGame.spreadLine,
          overUnder: dbGame.overUnder,
          homeRecord: espnGame.homeRecord ?? dbGame.homeRecord,
          awayRecord: espnGame.awayRecord ?? dbGame.awayRecord,
          weather: espnGame.weather ?? dbGame.weather,
          broadcast: espnGame.broadcast ?? dbGame.broadcast,
          oddsProvider: espnGame.oddsProvider ?? dbGame.oddsProvider,
          ...frozenOdds,
          bonusSelectionSpread,
          isDoubleGame: dbGame.id === week.doubleGameId,
          startTime: dbGame.startTime.toISOString(),
        };
      }
      // pre-game: use DB data, overlay ESPN venue/odds if fresher
      const preEspn = espnGames.find((g) => g.espnGameId === dbGame.espnGameId);
      return {
        ...dbGame,
          pickLocked: lockedGameIds.has(dbGame.id),
        venue: preEspn?.venue ?? dbGame.venue,
        spreadLine: preEspn?.spreadLine ?? dbGame.spreadLine,
        overUnder: preEspn?.overUnder ?? dbGame.overUnder,
        homeRecord: preEspn?.homeRecord ?? dbGame.homeRecord,
        awayRecord: preEspn?.awayRecord ?? dbGame.awayRecord,
        weather: preEspn?.weather ?? dbGame.weather,
        broadcast: preEspn?.broadcast ?? dbGame.broadcast,
        oddsProvider: preEspn?.oddsProvider ?? dbGame.oddsProvider,
        ...frozenOdds,
        bonusSelectionSpread,
        isDoubleGame: dbGame.id === week.doubleGameId,
        startTime: dbGame.startTime.toISOString(),
      };
    });

    return NextResponse.json({ games, week: serializedWeek });
  } catch (error) {
    console.error('Live games error:', error);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}
