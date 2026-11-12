import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { weekNumber, lockTime } = await request.json();

  const season = await prisma.season.findFirst({
    where: { isSandbox: true },
    orderBy: { id: 'desc' },
  });

  if (!season) return NextResponse.json({ error: 'No sandbox season' }, { status: 404 });

  const parsedLockTime = new Date(lockTime);
  if (!Number.isInteger(Number(weekNumber)) || Number(weekNumber) < 1 || Number.isNaN(parsedLockTime.getTime())) {
    return NextResponse.json({ error: 'Invalid week number or lock time' }, { status: 400 });
  }

  const week = await prisma.week.create({
    data: {
      seasonId: season.id,
      weekNumber: parseInt(weekNumber),
      lockTime: parsedLockTime,
    },
  });

  return NextResponse.json({ week });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { weekId } = await request.json();
  const week = await prisma.week.findUnique({
    where: { id: weekId },
    include: { games: true, season: true },
  });
  if (!week?.season.isSandbox) return NextResponse.json({ error: 'Sandbox week not found' }, { status: 404 });

  const gameIds = week.games.map(g => g.id);
  await prisma.$transaction([
    prisma.weeklyScore.deleteMany({ where: { weekId } }),
    prisma.tiebreaker.deleteMany({ where: { weekId } }),
    prisma.pick.deleteMany({ where: { weekId } }),
    prisma.game.deleteMany({ where: { id: { in: gameIds } } }),
    prisma.week.delete({ where: { id: weekId } }),
  ]);

  return NextResponse.json({ ok: true });
}
