import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateWeeklyScores } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
  if (user?.role !== 'ADMIN') return null;
  return session;
}

// PUT /api/admin/score-override
// Body: { userId, weekId, overridePoints, overrideNote }
// Set overridePoints to null to clear the override
export async function PUT(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId, weekId, overridePoints, overrideNote } = await request.json();

  if (!userId || !weekId) {
    return NextResponse.json({ error: 'userId and weekId are required' }, { status: 400 });
  }

  if (overridePoints !== null && overridePoints !== undefined && typeof overridePoints !== 'number') {
    return NextResponse.json({ error: 'overridePoints must be a number or null' }, { status: 400 });
  }

  // Upsert the score record with override fields
  await prisma.weeklyScore.upsert({
    where: { userId_weekId: { userId, weekId } },
    create: {
      userId,
      weekId,
      points: 0,
      adminOverridePoints: overridePoints ?? null,
      adminOverrideNote: overrideNote ?? null,
    },
    update: {
      adminOverridePoints: overridePoints ?? null,
      adminOverrideNote: overrideNote ?? null,
    },
  });

  // Re-run scoring so ranks update to reflect the override
  await calculateWeeklyScores(weekId);

  return NextResponse.json({ success: true });
}
