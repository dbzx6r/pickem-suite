import { prisma } from './prisma';
import { currentReminderWeek } from './reminders';

export async function createPickReminders(userId: string) {
  const profile = await prisma.user.findUnique({ where: { id: userId }, select: { profile: { select: { notificationPreferences: true } } } });
  const preferences = (profile?.profile?.notificationPreferences ?? {}) as { pickReminders?: boolean };
  const season = await prisma.season.findFirst({ where: { isActive: true, isSandbox: false }, include: { weeks: { include: { games: true } } } });
  if (!season) return;
  const week = currentReminderWeek(season.weeks);
  const futureWeeks = season.weeks.filter((item) => !item.isFinal && item.id !== week?.id);
  await prisma.notification.deleteMany({
    where: {
      userId,
      type: { in: ['PICK_REMINDER', 'PICK_LOCK_REMINDER'] },
      OR: [
        ...futureWeeks.map((item) => ({ dedupeKey: `week-entry:${userId}:${item.id}` })),
        ...futureWeeks.map((item) => ({
          dedupeKey: { startsWith: `lock:${userId}:` },
          href: `/picks/${item.weekNumber}`,
        })),
      ],
    },
  });
  if (preferences.pickReminders === false) return;
  if (!week) return;

  const now = new Date();
  const openGames = week.games.filter((game) => game.startTime > now && !game.isFinal);
  const tiebreakerGameOpen = Boolean(
    week.tiebreakerGameId && openGames.some((game) => game.id === week.tiebreakerGameId),
  );
  const [pickCount, tiebreaker] = await Promise.all([
    prisma.pick.count({ where: { userId, gameId: { in: openGames.map((game) => game.id) } } }),
    prisma.tiebreaker.findUnique({ where: { userId_weekId: { userId, weekId: week.id } }, select: { id: true } }),
  ]);
  const missingPicks = Math.max(0, openGames.length - pickCount);
  const missingTiebreaker = tiebreakerGameOpen && !tiebreaker;
  if (missingPicks || missingTiebreaker) {
    const parts = [missingPicks ? `${missingPicks} pick${missingPicks === 1 ? '' : 's'}` : '', missingTiebreaker ? 'tiebreaker' : ''].filter(Boolean);
    await prisma.notification.upsert({
      where: { dedupeKey: `week-entry:${userId}:${week.id}` },
      create: { userId, type: 'PICK_REMINDER', title: `Week ${week.weekNumber} entry incomplete`, message: `Still needed: ${parts.join(' and ')}.`, href: `/picks/${week.weekNumber}`, dedupeKey: `week-entry:${userId}:${week.id}` },
      update: { title: `Week ${week.weekNumber} entry incomplete`, message: `Still needed: ${parts.join(' and ')}.`, href: `/picks/${week.weekNumber}` },
    });
  } else {
    await prisma.notification.deleteMany({ where: { userId, dedupeKey: `week-entry:${userId}:${week.id}`, readAt: null } });
  }
}

