import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { REGULAR_SEASON } from '@/lib/season';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
  return user?.role === 'ADMIN' ? session : null;
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, year } = await request.json();
  if (action !== 'start_regular_season' || !Number.isInteger(year)) {
    return NextResponse.json({ error: 'Invalid season transition request' }, { status: 400 });
  }

  const season = await prisma.$transaction(async (tx) => {
    let regularSeason = await tx.season.findUnique({
      where: {
        year_seasonType_isSandbox: {
          year,
          seasonType: REGULAR_SEASON,
          isSandbox: false,
        },
      },
    });

    if (!regularSeason) {
      regularSeason = await tx.season.create({
        data: {
          year,
          seasonType: REGULAR_SEASON,
          isActive: false,
          isSandbox: false,
        },
      });
    }

    const currentlyActive = await tx.season.findFirst({ where: { isSandbox: false, isActive: true } });
    const transitionAt = new Date();
    await tx.season.updateMany({
      where: { isSandbox: false, isActive: true, id: { not: regularSeason.id } },
      data: { isActive: false, archivedAt: transitionAt },
    });

    const activated = await tx.season.update({
      where: { id: regularSeason.id },
      data: { isActive: true, activatedAt: transitionAt, archivedAt: null },
    });
    if (currentlyActive?.id !== activated.id) await tx.seasonRollover.create({ data: { fromSeasonId: currentlyActive?.id ?? null, toSeasonId: activated.id, trigger: 'COMMISSIONER', summary: { behavior: 'Fresh active standings; prior season retained as archive' } } });
    return activated;
  });
  await recordAudit({ actorId: session.user.id, action: 'REGULAR_SEASON_ACTIVATE', targetType: 'Season', targetId: season.id, details: { year } });

  return NextResponse.json({
    season,
    message: `${year} regular season activated; preseason statistics remain preserved separately`,
  });
}
