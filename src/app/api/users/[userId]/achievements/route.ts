import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId } = await params;
  const earned = await prisma.userAchievement.findMany({
    where: { userId },
    include: { achievement: true },
    orderBy: { earnedAt: 'asc' },
  });

  return NextResponse.json({
    earned: earned.map((e) => ({
      achievementId: e.achievementId,
      earnedAt: e.earnedAt,
      slateId: e.slateId,
    })),
    totalEarned: earned.length,
  });
}
