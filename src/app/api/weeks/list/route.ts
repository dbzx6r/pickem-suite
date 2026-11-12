import { NextRequest, NextResponse } from 'next/server';
import { isSandboxModeFromCookieHeader } from '@/lib/sandboxContext';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const season = await prisma.season.findFirst({
    where: isSandboxModeFromCookieHeader(request.headers.get('cookie')) ? { isSandbox: true } : { isActive: true, isSandbox: false },
    orderBy: { id: 'desc' },
  });

  if (!season) return NextResponse.json({ weeks: [] });

  const weeks = await prisma.week.findMany({
    where: { seasonId: season.id },
    orderBy: { weekNumber: 'asc' },
    select: { id: true, weekNumber: true, isFinal: true },
  });

  return NextResponse.json({ weeks, seasonId: season.id, viewerId: session.user.id });
}
