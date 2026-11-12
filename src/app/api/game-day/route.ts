import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { projectedPickPoints as pointsForPick } from '@/lib/pick-scoring';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const season = await prisma.season.findFirst({ where: { isActive: true, isSandbox: false } });
  if (!season) return NextResponse.json({ week: null, standings: [], scenarios: [] });
  const week = await prisma.week.findFirst({
    where: { seasonId: season.id, isFinal: false },
    orderBy: { weekNumber: 'asc' },
    include: { games: { orderBy: { startTime: 'asc' } } },
  });
  if (!week) return NextResponse.json({ week: null, standings: [], scenarios: [] });

  const now = new Date();
  const startedGameIds = week.games.filter((game) => game.startTime <= now).map((game) => game.id);
  const [users, picks, priorScores] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true, email: true, profile: { select: { displayName: true, avatarUrl: true } } },
    }),
    prisma.pick.findMany({
      where: { weekId: week.id, OR: [{ gameId: { in: startedGameIds } }, { userId }] },
      select: { userId: true, gameId: true, pickedTeam: true },
    }),
    prisma.weeklyScore.findMany({
      where: { week: { seasonId: season.id, id: { not: week.id } } },
      select: { userId: true, points: true, adminOverridePoints: true },
    }),
  ]);
  const priorMap = new Map<string, number>();
  for (const row of priorScores) priorMap.set(row.userId, (priorMap.get(row.userId) ?? 0) + (row.adminOverridePoints ?? row.points));
  const gameMap = new Map(week.games.map((game) => [game.id, game]));
  const picksByUser = new Map<string, typeof picks>();
  for (const pick of picks) picksByUser.set(pick.userId, [...(picksByUser.get(pick.userId) ?? []), pick]);

  const standings = users.map((user) => {
    const visiblePicks = picksByUser.get(user.id) ?? [];
    let secured = 0;
    let projected = 0;
    for (const pick of visiblePicks) {
      const game = gameMap.get(pick.gameId);
      if (!game || game.startTime > now) continue;
      const points = pointsForPick(game, pick.pickedTeam, week.doubleGameId);
      projected += points;
      if (game.isFinal) secured += points;
    }
    const prior = priorMap.get(user.id) ?? 0;
    return {
      userId: user.id,
      displayName: user.profile?.displayName ?? user.email.split('@')[0],
      avatarUrl: user.profile?.avatarUrl ?? null,
      priorPoints: prior,
      securedWeekPoints: secured,
      projectedWeekPoints: projected,
      projectedTotal: prior + projected,
      isCurrentUser: user.id === userId,
    };
  }).sort((a, b) => b.projectedTotal - a.projectedTotal || b.securedWeekPoints - a.securedWeekPoints || a.displayName.localeCompare(b.displayName));
  const rankedStandings = standings.map((entry, index) => ({ ...entry, rank: index + 1 }));

  const currentUserPicks = picksByUser.get(userId) ?? [];
  const scenarios = week.games.filter((game) => game.startTime <= now && !game.isFinal).map((game) => {
    const myPick = currentUserPicks.find((pick) => pick.gameId === game.id)?.pickedTeam ?? null;
    const revealed = picks.filter((pick) => pick.gameId === game.id);
    const sides = [game.awayTeam, game.homeTeam].map((team) => ({
      team,
      names: revealed
        .filter((pick) => pick.pickedTeam === team)
        .map((pick) => rankedStandings.find((entry) => entry.userId === pick.userId)?.displayName)
        .filter((name): name is string => Boolean(name)),
    }));
    const opposingNames = sides.find((side) => side.team !== myPick)?.names ?? [];
    return {
      gameId: game.id,
      matchup: `${game.awayTeam} at ${game.homeTeam}`,
      status: game.statusState,
      clock: game.clock,
      period: game.period,
      myPick,
      pointsAtStake: game.id === week.doubleGameId ? 2 : 1,
      opposingNames,
      sides,
    };
  });
  const me = rankedStandings.find((entry) => entry.userId === userId) ?? null;
  const closestRival = me
    ? rankedStandings.filter((entry) => entry.userId !== userId).sort((a, b) => Math.abs(a.projectedTotal - me.projectedTotal) - Math.abs(b.projectedTotal - me.projectedTotal))[0] ?? null
    : null;

  return NextResponse.json({
    season: { year: season.year, seasonType: season.seasonType },
    week: { id: week.id, weekNumber: week.weekNumber, games: week.games.length },
    standings: rankedStandings,
    scenarios,
    closestRival,
    privacy: 'Only picks for games at or after kickoff are included for other participants.',
    updatedAt: now.toISOString(),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
