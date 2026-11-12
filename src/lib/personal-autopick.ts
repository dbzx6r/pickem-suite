import { prisma } from '@/lib/prisma';
import { getOpenWeekIds } from '@/lib/pick-window';

export function isPersonalAutopickUser(userId: string): boolean {
  const allowedUserId = process.env.AUTOPICK_ALLOWED_USER_ID?.trim();
  return Boolean(allowedUserId && userId === allowedUserId);
}

export async function getNextPersonalAutopickWeek(now: Date = new Date()) {
  const activeSeason = await prisma.season.findFirst({
    where: { isActive: true, isSandbox: false },
  });
  if (!activeSeason) return null;

  const weeks = await prisma.week.findMany({
    where: { seasonId: activeSeason.id },
    orderBy: { weekNumber: 'asc' },
    include: {
      season: true,
      games: { orderBy: { startTime: 'asc' } },
    },
  });
  const settings = await prisma.leagueSettings.findUnique({ where: { id: 'default' }, select: { pickWindowWeeks: true } });
  const openWeekIds = getOpenWeekIds(weeks, now, settings?.pickWindowWeeks ?? 2);
  return weeks.find((week) => openWeekIds.has(week.id)) ?? null;
}
