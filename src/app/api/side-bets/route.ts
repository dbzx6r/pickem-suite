import { NextRequest, NextResponse } from 'next/server';
import { gamePickOpen } from '@/lib/game-lock';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get('userId');

  const isOwnProfile = !targetUserId || targetUserId === session?.user?.id;

  if (isOwnProfile && !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = isOwnProfile ? session!.user!.id : targetUserId!;

  const whereClause = isOwnProfile
    ? { OR: [{ proposerId: userId }, { acceptorId: userId }] }
    : {
        OR: [{ proposerId: userId }, { acceptorId: userId }],
        status: { in: ['accepted', 'resolved'] },
      };

  const bets = await prisma.sideBet.findMany({
    where: whereClause,
    include: {
      proposer: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      acceptor: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: isOwnProfile ? 50 : 100,
  });

  // Batch-fetch game info for NFL games
  const gameIds = [...new Set(bets.map((b) => b.gameId).filter(Boolean) as string[])];
  const games =
    gameIds.length > 0
      ? await prisma.game.findMany({
          where: { id: { in: gameIds } },
          select: { id: true, homeTeam: true, awayTeam: true, startTime: true, isFinal: true },
        })
      : [];
  const gameMap = new Map(games.map((g) => [g.id, g]));

  const betsWithGames = bets.map((bet) => ({
    ...bet,
    proposerProfile: bet.proposer.profile,
    acceptorProfile: bet.acceptor.profile,
    game: bet.gameId ? (gameMap.get(bet.gameId) ?? null) : null,
  }));

  return NextResponse.json({ bets: betsWithGames, isOwnProfile });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id as string;
  const body = await request.json();
  const { acceptorId, sport, gameId, mlbGameId, betType, betDetails, stake } = body;

  if (!acceptorId || !sport || !betType || !betDetails) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (acceptorId === userId) {
    return NextResponse.json({ error: 'Cannot bet against yourself' }, { status: 400 });
  }

  if (stake != null && stake !== '') return NextResponse.json({ error: 'Stakes are not supported. Challenges are for bragging rights only.' }, { status: 400 });
  const game = typeof gameId === 'string' ? await prisma.game.findUnique({ where: { id: gameId }, include: { week: { include: { season: true } } } }) : null;
  const opponent = typeof acceptorId === 'string' ? await prisma.user.findUnique({ where: { id: acceptorId }, select: { role: true } }) : null;
  if (sport !== 'nfl' || mlbGameId || !game || game.week.season.isSandbox || !game.week.season.isActive || !opponent || opponent.role !== 'USER' || !(await gamePickOpen(game))) return NextResponse.json({ error: 'Choose an eligible player and an unstarted active-season game.' }, { status: 400 });
  const validTeam = betDetails && [game.homeTeam, game.awayTeam].includes(betDetails.team);
  const validValue = betDetails && typeof betDetails.value === 'number' && Number.isFinite(betDetails.value) && Math.abs(betDetails.value) <= 200;
  if (!(betType === 'winner' && validTeam || betType === 'spread' && validTeam && validValue || betType === 'total' && ['over','under'].includes(betDetails.direction) && validValue && betDetails.value >= 0)) return NextResponse.json({ error: 'Invalid prediction' }, { status: 400 });
  const bet = await prisma.sideBet.create({
    data: {
      proposerId: userId,
      acceptorId,
      sport,
      gameId: gameId ?? null,
      mlbGameId: mlbGameId ?? null,
      betType,
      betDetails,
      stake: null,
      status: 'pending',
    },
  });

  return NextResponse.json({ bet }, { status: 201 });
}
