import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchEspnScoreboard } from '@/lib/espn';
import { espnSeasonType } from '@/lib/season';
import { selectWeeklyDoubleGame } from '@/lib/double-points';
import { selectWeeklyTiebreaker } from '@/lib/tiebreaker-selection';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
  if (user?.role !== 'ADMIN') return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const seasons = await prisma.season.findMany({
    include: {
      weeks: {
        include: { games: true, _count: { select: { picks: true } } },
        orderBy: { weekNumber: 'asc' },
      },
    },
  });

  return NextResponse.json({ seasons });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, weekNumber, seasonId, weekId, doubleGameId, tiebreakerGameId, isFinal, recapVisible, lockTime } =
    await request.json();

  if (action === 'create_week') {
    // Fetch games from ESPN
    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 });

    const espnGames = await fetchEspnScoreboard(
      weekNumber,
      season.year,
      espnSeasonType(season.seasonType),
    );

    // Calculate lock time from earliest game
    const sortedGames = [...espnGames].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );
    const calculatedLockTime = lockTime
      ? new Date(lockTime)
      : sortedGames[0]?.startTime || new Date();

    const week = await prisma.week.create({
      data: {
        seasonId,
        weekNumber,
        lockTime: calculatedLockTime,
      },
    });

    // Create games
    const createdGames = await Promise.all(
      espnGames.map((g) =>
        prisma.game.create({
          data: {
            weekId: week.id,
            homeTeam: g.homeTeam,
            awayTeam: g.awayTeam,
            startTime: g.startTime,
            espnGameId: g.espnGameId,
            statusState: 'pre',
            venue: g.venue ?? null,
            spreadLine: g.spreadLine ?? null,
            overUnder: g.overUnder ?? null,
          },
        })
      )
    );

    // Sandbox retains manual/rehearsal behavior; live bonus uses Tuesday odds.
    const shuffled = [...createdGames].sort(() => Math.random() - 0.5);
    const randomDouble = shuffled[0];
    const randomTiebreaker = shuffled[1] ?? shuffled[0];

    await prisma.week.update({
      where: { id: week.id },
      data: {
        doubleGameId: season.isSandbox ? randomDouble?.id : null,
        tiebreakerGameId: season.isSandbox ? randomTiebreaker?.id : null,
      },
    });

    if (!season.isSandbox) {
      await selectWeeklyDoubleGame(week.id, new Map(espnGames.map(g => [g.espnGameId, g.spreadLine])));
      await selectWeeklyTiebreaker(week.id);
    }

    return NextResponse.json({ week, gamesCount: createdGames.length });
  }

  if (action === 'update_week') {
    if (doubleGameId !== undefined || tiebreakerGameId !== undefined) {
      const target = await prisma.week.findUnique({ where: { id: weekId }, include: { season: true } });
      if (!target) return NextResponse.json({ error: 'Week not found' }, { status: 404 });
      if (!target.season.isSandbox) return NextResponse.json({ error: 'Live bonus and tiebreaker games are selected automatically: Tuesday closest spread and last scheduled kickoff, respectively.' }, { status: 409 });
    }
    const updates: Record<string, unknown> = {};
    if (doubleGameId !== undefined) updates.doubleGameId = doubleGameId;
    if (tiebreakerGameId !== undefined) updates.tiebreakerGameId = tiebreakerGameId;
    if (isFinal !== undefined) updates.isFinal = isFinal;
    if (recapVisible !== undefined) updates.recapVisible = recapVisible;
    if (lockTime !== undefined) updates.lockTime = new Date(lockTime);

    const updatedWeek = await prisma.week.update({
      where: { id: weekId },
      data: updates,
    });

    return NextResponse.json({ week: updatedWeek });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
