import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateWeeklyScores } from '@/lib/scoring';
import { computeWeekAwards } from '@/lib/awards';
import { resolveSideBetsForNFLGame } from '@/lib/sideBets';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
  if (user?.role !== 'ADMIN') return null;
  return session;
}

// GET /api/admin/scoring?weekId=xxx — returns per-user scores for a week
export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const weekId = request.nextUrl.searchParams.get('weekId');
  if (!weekId) return NextResponse.json({ error: 'weekId required' }, { status: 400 });

  const scores = await prisma.weeklyScore.findMany({
    where: { weekId },
    include: {
      user: { include: { profile: true } },
    },
    orderBy: { finalRank: 'asc' },
  });

  return NextResponse.json({
    scores: scores.map((s) => ({
      userId: s.userId,
      displayName: s.user.profile?.displayName ?? s.user.email,
      points: s.points,
      finalRank: s.finalRank,
      adminOverridePoints: s.adminOverridePoints,
      adminOverrideNote: s.adminOverrideNote,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { weekId } = await request.json();

  if (!weekId) {
    return NextResponse.json({ error: 'weekId required' }, { status: 400 });
  }

  try {
    await calculateWeeklyScores(weekId);
    await computeWeekAwards(weekId, prisma);
    const games = await prisma.game.findMany({ where: { weekId, isFinal: true } });
    await Promise.all(games.map((g) => resolveSideBetsForNFLGame(g.id)));
    await recordAudit({ actorId: session.user.id, action: 'SCORING_RUN', targetType: 'Week', targetId: weekId, details: { finalGames: games.length } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Scoring error:', error);
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 });
  }
}
