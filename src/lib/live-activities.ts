import { pushAPNs as push } from './apns';
import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { MobileError, MobileUser } from './mobile-auth';
import { liveActivitiesEnabled } from './live-activity-config';
export { liveActivitiesEnabled } from './live-activity-config';
import { activityPayload, invalidAPNsToken, validActivityRegistration } from './live-activity-payload';

const sessionKey = (request: Request) => `mobile-session:${createHash('sha256').update(request.headers.get('authorization')?.slice(7) ?? '').digest('hex')}`;
export async function registerLiveActivity(request: Request, user: MobileUser, body: Record<string, unknown>) {
  if (!liveActivitiesEnabled()) throw new MobileError(503, 'Background Live Activities are not configured.');
  if (!validActivityRegistration(body)) throw new MobileError(400, 'Invalid Live Activity registration.');
  const { activityId, gameId, token, environment } = body as Record<string, string>;
  const game = await prisma.game.findFirst({ where: { id: gameId, isFinal: false, statusState: 'in', week: { season: { isActive: true, isSandbox: false } } } });
  if (!game) throw new MobileError(404, 'Live game not found.');
  await prisma.$transaction(async tx => {
    // Serialize each account’s quota and prevent cross-account activity/token reassignment.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const previous = await tx.liveActivity.findUnique({ where: { activityId } });
    if (previous && (previous.userId !== user.id || previous.gameId !== gameId || previous.sessionKey !== sessionKey(request))) throw new MobileError(409, 'Activity belongs to a different session.');
    if (!previous && await tx.liveActivity.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }) >= 8) throw new MobileError(429, 'Stop an existing Live Activity first.');
    await tx.liveActivity.upsert({ where: { activityId }, create: {
      activityId, gameId, userId: user.id, sessionKey: sessionKey(request), sessionVersion: user.sessionVersion,
      token, environment, expiresAt: new Date(Date.now() + 8 * 3600_000),
    }, update: { token, environment } });
  });
  return { ok: true };
}
export async function removeLiveActivity(request: Request, user: MobileUser, activityId?: unknown) {
  if (activityId !== undefined && (typeof activityId !== 'string' || activityId.length > 80)) throw new MobileError(400, 'Invalid activity.');
  await prisma.liveActivity.deleteMany({ where: { userId: user.id, sessionKey: sessionKey(request), ...(typeof activityId === 'string' ? { activityId } : {}) } });
  return { ok: true };
}
// Called only after a successful upstream game refresh. Failure never fails NFL sync.
export async function deliverLiveActivities(gameIds: string[], send: typeof push = push) {
  if (!liveActivitiesEnabled() || !gameIds.length) return;
  try {
    await prisma.liveActivity.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    const rows = await prisma.liveActivity.findMany({ where: { gameId: { in: gameIds } }, include: { game: { include: { week: { include: { season: true } } } }, user: { select: { sessionVersion: true, mustChangePassword: true } } }, take: 100, orderBy: { lastSentAt: 'asc' } });
    // Small batches bound pressure on the sync worker and APNs.
    for (let i = 0; i < rows.length; i += 10) await Promise.all(rows.slice(i, i + 10).map(async row => {
      try {
        const session = await prisma.rateLimitBucket.findUnique({ where: { key: row.sessionKey } });
        if (!session || session.resetAt <= new Date() || row.user.sessionVersion !== row.sessionVersion || row.user.mustChangePassword || !row.game.week.season.isActive || row.game.week.season.isSandbox) {
          await prisma.liveActivity.deleteMany({ where: { activityId: row.activityId } }); return;
        }
        const payload = activityPayload(row.game);
        const response = await send(row.token, row.environment, payload);
        if (invalidAPNsToken(response.status, response.reason) || (response.status === 200 && payload.aps.event === 'end')) {
          await prisma.liveActivity.deleteMany({ where: { activityId: row.activityId, token: row.token } });
        } else if (response.status === 200) {
          await prisma.liveActivity.updateMany({ where: { activityId: row.activityId, token: row.token }, data: { lastSentAt: new Date() } });
        } else { console.warn('Live Activity delivery deferred', response.status); }
      } catch { console.warn('Live Activity delivery deferred'); }
    }));
  } catch { console.warn('Live Activity dispatch unavailable'); }
}
