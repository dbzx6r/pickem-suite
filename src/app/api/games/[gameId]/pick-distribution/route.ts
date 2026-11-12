import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isGamePickRevealed } from '@/lib/pick-privacy';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { gameId } = await params;
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { week: { select: { doubleGameId: true } }, picks: { include: { user: { select: { id: true, profile: { select: { displayName: true } } } } }, orderBy: { createdAt: 'asc' } } },
  });
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  if (!isGamePickRevealed(game.startTime)) return NextResponse.json({ error: 'Hidden until kickoff' }, { status: 403 });
  const favorite = [game.awayTeam, game.homeTeam].find((team) => game.spreadLine?.toUpperCase().startsWith(`${team} `)) ?? null;
  const teams = [game.awayTeam, game.homeTeam].map((team) => {
    const picks = game.picks.filter((pick) => pick.pickedTeam === team);
    const percentage = game.picks.length ? Math.round((picks.length / game.picks.length) * 100) : 0;
    return {
      team,
      count: picks.length,
      percentage,
      participants: picks.map((pick) => ({ id: pick.user.id, displayName: pick.user.profile?.displayName ?? 'Participant' })),
      isFavorite: favorite === team,
      isOnlyPicker: picks.length === 1,
      isConsensus: percentage >= 75,
      includesCurrentUser: picks.some((pick) => pick.user.id === session.user.id),
    };
  });
  const sorted = [...teams].sort((a, b) => b.count - a.count);
  return NextResponse.json({
    total: game.picks.length,
    teams,
    majorityTeam: sorted[0]?.count > sorted[1]?.count ? sorted[0].team : null,
    minorityTeam: sorted[0]?.count > sorted[1]?.count && sorted[1]?.count > 0 ? sorted[1].team : null,
    pointsAtStake: game.week.doubleGameId === game.id ? 2 : 1,
    spreadLine: game.spreadLine,
    source: game.spreadLine ? `ESPN${game.oddsProvider ? ` · ${game.oddsProvider}` : ''}` : null,
  });
}
