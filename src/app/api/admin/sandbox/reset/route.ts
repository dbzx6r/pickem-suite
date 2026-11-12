import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const season = await prisma.season.findFirst({
    where: { isSandbox: true },
    include: { weeks: true },
  });

  if (!season) return NextResponse.json({ ok: true });

  const weekIds = season.weeks.map(w => w.id);
  await prisma.$transaction([
    prisma.tiebreakerAudit.deleteMany({ where: { weekId: { in: weekIds } } }),
    prisma.weeklyScore.deleteMany({ where: { weekId: { in: weekIds } } }),
    prisma.tiebreaker.deleteMany({ where: { weekId: { in: weekIds } } }),
    prisma.pick.deleteMany({ where: { weekId: { in: weekIds } } }),
  ]);

  return NextResponse.json({ ok: true });
}
