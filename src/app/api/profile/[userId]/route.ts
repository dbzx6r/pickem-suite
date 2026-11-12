import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserStats } from '@/lib/scoring';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { userId } = await params;
    const stats = await getUserStats(userId, session.user.id);
    if (!stats) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get pick distribution for public picks after lock
    const weeklyPicksData = await prisma.week.findMany({
      where: {
        season: { isActive: true, isSandbox: false },
      },
      include: {
        games: true,
        weeklyScores: { where: { userId } },
      },
      orderBy: { weekNumber: 'asc' },
    });

    return NextResponse.json({ stats, weeklyPicksData });
  } catch (error) {
    console.error('Profile error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
