import { prisma } from '@/lib/prisma';
import { selectLatestWeeklyWinner } from '@/lib/weekly-winner';

export async function getLatestWeeklyWinner(isSandbox = false) {
  const season = await prisma.season.findFirst({
    where: isSandbox ? { isSandbox: true } : { isActive: true, isSandbox: false },
    select: { id: true },
  });
  if (!season) return null;
  const weeks = await prisma.week.findMany({
    where: { seasonId: season.id, isFinal: true },
    select: {
      id: true, weekNumber: true, isFinal: true,
      games: { select: { isFinal: true } },
      weeklyScores: {
        where: { finalRank: 1 },
        select: {
          userId: true, finalRank: true, points: true, adminOverridePoints: true,
          user: { select: { profile: { select: { displayName: true } } } },
        },
      },
    },
  });
  return selectLatestWeeklyWinner(weeks);
}
