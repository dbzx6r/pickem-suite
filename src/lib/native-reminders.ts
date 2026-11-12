import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { MobileError, MobileUser } from './mobile-auth';
import { apnsConfiguration } from './live-activity-config';
import { pushAPNs } from './apns';
import { invalidAPNsToken } from './live-activity-payload';
import { validReminderDevice, reminderDeviceID, reminderPayload } from './native-reminder-policy';
import { gamePickOpen } from './game-lock';
import { gameLockReminderCopy, missingEntryItemsForGame, parseReminderMinutes } from './reminders';
export const nativeRemindersEnabled = () => process.env.PICK_REMINDERS_ENABLED === 'true' && !!apnsConfiguration('sandbox') && !!apnsConfiguration('production');
const sessionKey = (request: Request) => `mobile-session:${createHash('sha256').update(request.headers.get('authorization')?.slice(7) ?? '').digest('hex')}`;
export async function reminderSettings(request: Request, user: MobileUser) {
  const settings = await prisma.leagueSettings.findUnique({ where: { id: 'default' } });
  const profile = await prisma.profile.findFirst({ where: { user: { id: user.id } }, select: { notificationPreferences: true } });
  return { enabled: await prisma.nativeDevice.count({ where: { userId: user.id, sessionKey: sessionKey(request), expiresAt: { gt: new Date() } } }) > 0,
    accountEnabled: (profile?.notificationPreferences as { pickReminders?: boolean } | null)?.pickReminders !== false,
    minutes: parseReminderMinutes(settings?.reminderMinutes, settings?.reminderHours ?? 24) };
}
export async function registerReminderDevice(request: Request, user: MobileUser, body: Record<string, unknown>) {
  if (!nativeRemindersEnabled()) throw new MobileError(503, 'Pick reminders are not configured on this server.');
  if (user.role !== 'USER') throw new MobileError(403, 'Pick reminders are for players.');
  if (!validReminderDevice(body)) throw new MobileError(400, 'Invalid notification registration.');
  const token = body.token as string, environment = body.environment as string, key = sessionKey(request);
  const id = reminderDeviceID(token, environment);
  const session = await prisma.rateLimitBucket.findUnique({ where: { key } });
  if (!session || session.resetAt <= new Date()) throw new MobileError(401, 'Sign in again.');
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    await tx.nativeDevice.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    const previous = await tx.nativeDevice.findUnique({ where: { id } });
    if (previous && previous.userId !== user.id) throw new MobileError(409, 'Sign out of the previous account on this device first.');
    if (!previous && await tx.nativeDevice.count({ where: { userId: user.id } }) >= 8) throw new MobileError(429, 'Too many registered devices.');
    await tx.nativeDevice.upsert({ where: { id }, create: { id, token, environment, userId: user.id, sessionKey: key, sessionVersion: user.sessionVersion, expiresAt: session.resetAt }, update: { sessionKey: key, sessionVersion: user.sessionVersion, expiresAt: session.resetAt } });
  });
  return { ok: true };
}
export async function removeReminderDevices(request: Request, user: MobileUser) {
  await prisma.nativeDevice.deleteMany({ where: { userId: user.id, sessionKey: sessionKey(request) } });
  return { ok: true };
}
// Independent of web-push delivery: an existing web notification must not suppress the iPhone alert.
export async function deliverNativeReminder(userId: string, gameId: string, lead: number, send = pushAPNs) {
  if (!nativeRemindersEnabled()) return;
  try {
    const devices = await prisma.nativeDevice.findMany({ where: { userId, expiresAt: { gt: new Date() } }, take: 8 });
    for (const device of devices) {
      const [user, session, game] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
        prisma.rateLimitBucket.findUnique({ where: { key: device.sessionKey } }),
        prisma.game.findUnique({ where: { id: gameId }, include: { week: { include: { season: true } }, picks: { where: { userId } } } }),
      ]);
      if (!user || user.role !== 'USER' || user.mustChangePassword || user.sessionVersion !== device.sessionVersion || !session || session.count !== device.sessionVersion || session.resetAt <= new Date()) {
        await prisma.nativeDevice.deleteMany({ where: { id: device.id, sessionKey: device.sessionKey } }); continue;
      }
      if ((user.profile?.notificationPreferences as { pickReminders?: boolean } | null)?.pickReminders === false || !game || game.week.isFinal || !game.week.season.isActive || game.week.season.isSandbox || !(await gamePickOpen(game))) continue;
      const tiebreaker = await prisma.tiebreaker.findUnique({ where: { userId_weekId: { userId, weekId: game.weekId } } });
      const needs = missingEntryItemsForGame({ gameId, tiebreakerGameId: game.week.tiebreakerGameId, hasPick: game.picks.length > 0, hasTiebreaker: !!tiebreaker });
      if (!needs.missingPick && !needs.missingTiebreaker) continue;
      const dedupeKey = `native:${device.id}:lock:${gameId}:${lead}`;
      await prisma.notificationDelivery.upsert({ where: { dedupeKey }, update: {}, create: { userId, gameId, weekId: game.weekId, type: 'PICK_LOCK_REMINDER', channel: 'apns', status: 'PENDING', dedupeKey } });
      const claimed = await prisma.notificationDelivery.updateMany({ where: { dedupeKey, OR: [{ status: { in: ['PENDING', 'FAILED'] } }, { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - 120_000) } }] }, data: { status: 'SENDING' } });
      if (!claimed.count) continue;
      try {
        const copy = gameLockReminderCopy({ awayTeam: game.awayTeam, homeTeam: game.homeTeam, weekNumber: game.week.weekNumber, lead, ...needs });
        const result = await send(device.token, device.environment, reminderPayload(copy.title, copy.message, game.week.seasonId, game.week.weekNumber), { expires: Math.floor(game.startTime.getTime() / 1000), collapse: createHash('sha256').update(dedupeKey).digest('hex') });
        if (invalidAPNsToken(result.status, result.reason)) await prisma.nativeDevice.deleteMany({ where: { id: device.id, sessionKey: device.sessionKey } });
        await prisma.notificationDelivery.updateMany({ where: { dedupeKey }, data: { status: result.status === 200 ? 'SENT' : 'FAILED', sentAt: result.status === 200 ? new Date() : null, error: result.status === 200 ? null : `APNs ${result.status}` } });
      } catch { await prisma.notificationDelivery.updateMany({ where: { dedupeKey }, data: { status: 'FAILED', error: 'APNs temporarily unavailable' } }); }
    }
  } catch { console.warn('Native pick reminder delivery deferred'); }
}
