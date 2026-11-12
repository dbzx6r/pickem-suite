import { prisma } from './prisma';

export async function getActiveSeason(isSandbox: boolean) {
  if (isSandbox) {
    return prisma.season.findFirst({
      where: { isSandbox: true },
      orderBy: { id: 'desc' },
    });
  }
  return prisma.season.findFirst({
    where: { isActive: true, isSandbox: false },
  });
}

export async function getActiveWeek(isSandbox: boolean) {
  const season = await getActiveSeason(isSandbox);
  if (!season) return null;
  return prisma.week.findFirst({
    where: { seasonId: season.id, isFinal: false },
    orderBy: { weekNumber: 'asc' },
    include: { games: true, season: true, weeklyScores: true },
  });
}
