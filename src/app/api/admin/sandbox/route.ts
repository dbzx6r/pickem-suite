import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET — fetch sandbox season + weeks + games
export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const season = await prisma.season.findFirst({
    where: { isSandbox: true },
    orderBy: { id: 'desc' },
    include: {
      weeks: {
        include: { games: { orderBy: { startTime: 'asc' } } },
        orderBy: { weekNumber: 'asc' },
      },
    },
  });

  return NextResponse.json({ season });
}

// POST — create sandbox season
export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, isSandbox: true, isActive: false },
  });

  return NextResponse.json({ season });
}

// DELETE — nuke sandbox season
export async function DELETE() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const season = await prisma.season.findFirst({
    where: { isSandbox: true },
    include: { weeks: { include: { games: true } } },
  });

  if (!season) return NextResponse.json({ ok: true });

  const weekIds = season.weeks.map(w => w.id);
  const gameIds = season.weeks.flatMap(w => w.games.map(g => g.id));

  await prisma.$transaction([
    prisma.tiebreakerAudit.deleteMany({ where: { weekId: { in: weekIds } } }),
    prisma.weeklyScore.deleteMany({ where: { weekId: { in: weekIds } } }),
    prisma.tiebreaker.deleteMany({ where: { weekId: { in: weekIds } } }),
    prisma.pick.deleteMany({ where: { weekId: { in: weekIds } } }),
    prisma.game.deleteMany({ where: { id: { in: gameIds } } }),
    prisma.week.deleteMany({ where: { id: { in: weekIds } } }),
    prisma.season.delete({ where: { id: season.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
