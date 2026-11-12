import { deliverNativeReminder } from '@/lib/native-reminders';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendUserNotification } from '@/lib/push';
import { recordAudit } from '@/lib/audit';
import { currentReminderWeek, dueReminderLead, gameLockReminderCopy, missingEntryItemsForGame, parseReminderMinutes } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const now = new Date();
  const settings = await prisma.leagueSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  const leads = parseReminderMinutes(settings.reminderMinutes, settings.reminderHours);
  const maxLead = Math.max(...leads);
  const season = await prisma.season.findFirst({
    where: { isActive: true, isSandbox: false },
    include: { weeks: { select: { id: true, weekNumber: true, isFinal: true } } },
  });
  const currentWeek = currentReminderWeek(season?.weeks ?? []);
  const futureWeeks = (season?.weeks ?? []).filter((week) => !week.isFinal && week.id !== currentWeek?.id);
  const futureWeekIds = futureWeeks.map((week) => week.id);

  if (futureWeekIds.length > 0) {
    const futureDeliveries = await prisma.notificationDelivery.findMany({
      where: { type: 'PICK_LOCK_REMINDER', weekId: { in: futureWeekIds } },
      select: { dedupeKey: true },
    });
    const futureDedupeKeys = futureDeliveries.map((delivery) => delivery.dedupeKey);
    await prisma.$transaction([
      prisma.notificationDelivery.deleteMany({ where: { type: 'PICK_LOCK_REMINDER', weekId: { in: futureWeekIds } } }),
      prisma.notification.deleteMany({ where: { type: 'PICK_LOCK_REMINDER', dedupeKey: { in: futureDedupeKeys } } }),
      prisma.notification.deleteMany({
        where: {
          type: 'PICK_REMINDER',
          OR: futureWeekIds.map((weekId) => ({ dedupeKey: { endsWith: `:${weekId}` } })),
        },
      }),
    ]);
  }

  const games = await prisma.game.findMany({
    where: {
      weekId: currentWeek?.id ?? '__no-current-week__',
      isFinal: false,
      startTime: { gt: now, lte: new Date(now.getTime() + maxLead * 60_000) },
    },
    include: { week: true },
  });
  const users = await prisma.user.findMany({
    where: { role: 'USER' },
    select: {
      id: true,
      profile: { select: { notificationPreferences: true } },
      picks: { where: { gameId: { in: games.map((game) => game.id) } }, select: { gameId: true } },
      tiebreakers: { where: { weekId: { in: [...new Set(games.map((game) => game.weekId))] } }, select: { weekId: true } },
    },
  });

  let attempted = 0;
  for (const game of games) {
    const lead = dueReminderLead(game.startTime, now, leads);
    if (!lead) continue;
    for (const user of users) {
      const preferences = (user.profile?.notificationPreferences ?? {}) as { pickReminders?: boolean };
      if (preferences.pickReminders === false) continue;
      const needs = missingEntryItemsForGame({
        gameId: game.id,
        tiebreakerGameId: game.week.tiebreakerGameId,
        hasPick: user.picks.some((pick) => pick.gameId === game.id),
        hasTiebreaker: user.tiebreakers.some((tiebreaker) => tiebreaker.weekId === game.weekId),
      });
      if (!needs.missingPick && !needs.missingTiebreaker) continue;
      const copy = gameLockReminderCopy({
        awayTeam: game.awayTeam,
        homeTeam: game.homeTeam,
        weekNumber: game.week.weekNumber,
        lead,
        ...needs,
      });
      attempted += 1;
      await deliverNativeReminder(user.id, game.id, lead);
      await sendUserNotification({
        userId: user.id,
        type: 'PICK_LOCK_REMINDER',
        title: copy.title,
        message: copy.message,
        href: `/picks/${game.week.weekNumber}`,
        dedupeKey: `lock:${user.id}:${game.id}:${lead}`,
        weekId: game.weekId,
        gameId: game.id,
      });
    }
  }
  await recordAudit({ action: 'PICK_REMINDER_CRON', targetType: 'System', targetId: currentWeek?.id, details: { currentWeek: currentWeek?.weekNumber ?? null, games: games.length, attempted, leads, removedFutureWeeks: futureWeeks.length } });
  return NextResponse.json({ ok: true, currentWeek: currentWeek?.weekNumber ?? null, games: games.length, attempted, leads });
}
