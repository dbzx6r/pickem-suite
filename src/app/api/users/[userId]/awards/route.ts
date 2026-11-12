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
  const activeSeason = await prisma.season.findFirst({
    where: { isActive: true, isSandbox: false },
    include: { weeks: { select: { id: true } } },
  });
  const activeWeekIds = activeSeason?.weeks.map((week) => week.id) ?? [];

  const { userId } = await params;
  const awards = await prisma.slateAward.findMany({
    where: { userId, weekId: { in: activeWeekIds } },
  });

  const byType: Record<string, number> = {};
  for (const award of awards) {
    byType[award.awardType] = (byType[award.awardType] ?? 0) + 1;
  }

  return NextResponse.json({ total: awards.length, byType });
}
