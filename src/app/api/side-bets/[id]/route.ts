import { NextRequest, NextResponse } from 'next/server';
import { gamePickOpen } from '@/lib/game-lock';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id as string;
  const { action } = await request.json();
  const { id: betId } = await params;

  const bet = await prisma.sideBet.findUnique({ where: { id: betId } });
  if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 });

  if (action === 'accept') {
    const game = bet.gameId ? await prisma.game.findUnique({ where: { id: bet.gameId } }) : null;
    if (!game || !(await gamePickOpen(game))) return NextResponse.json({ error: 'This game has started or is locked.' }, { status: 400 });
  }
  if (action === 'accept' || action === 'decline') {
    if (bet.acceptorId !== userId) {
      return NextResponse.json(
        { error: 'Only the acceptor can accept or decline' },
        { status: 403 },
      );
    }
    if (bet.status !== 'pending') {
      return NextResponse.json({ error: 'Bet is not pending' }, { status: 400 });
    }
    const updated = await prisma.sideBet.update({
      where: { id: betId },
      data: { status: action === 'accept' ? 'accepted' : 'declined' },
    });
    return NextResponse.json({ bet: updated });
  }

  if (action === 'cancel') {
    if (bet.proposerId !== userId) {
      return NextResponse.json(
        { error: 'Only the proposer can cancel' },
        { status: 403 },
      );
    }
    if (bet.status !== 'pending') {
      return NextResponse.json({ error: 'Bet is not pending' }, { status: 400 });
    }
    const updated = await prisma.sideBet.update({
      where: { id: betId },
      data: { status: 'cancelled' },
    });
    return NextResponse.json({ bet: updated });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
