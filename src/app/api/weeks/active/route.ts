import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find the active non-sandbox season
  const season = await prisma.season.findFirst({
    where: { isActive: true, isSandbox: false },
  });

  if (!season) {
    return NextResponse.json({ games: [] });
  }

  // Find weeks that are not final (have upcoming/live games)
  const weeks = await prisma.week.findMany({
    where: { seasonId: season.id, isFinal: false },
    include: {
      games: {
        where: { isFinal: false },
        orderBy: { startTime: 'asc' },
        select: { id: true, homeTeam: true, awayTeam: true, startTime: true, isFinal: true },
      },
    },
    orderBy: { weekNumber: 'asc' },
    take: 2, // current week + next week
  });

  const games = weeks.flatMap((w) => w.games);

  return NextResponse.json({ games });
}
