import webPush from 'web-push';
import { prisma } from '@/lib/prisma';

type SendNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  href?: string;
  dedupeKey: string;
  weekId?: string;
  gameId?: string;
  pushEnabled?: boolean;
};

function configureWebPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch {
    return false;
  }
}

function pushErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

export async function sendUserNotification(input: SendNotificationInput) {
  const notification = await prisma.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      href: input.href,
      dedupeKey: input.dedupeKey,
    },
  });

  const delivery = await prisma.notificationDelivery.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: {
      userId: input.userId,
      weekId: input.weekId,
      gameId: input.gameId,
      type: input.type,
      channel: 'push',
      status: 'PENDING',
      dedupeKey: input.dedupeKey,
    },
  });

  if (delivery.status === 'SENT') return { notification, delivery, duplicate: true };

  const configured = configureWebPush();
  const subscriptions = configured && input.pushEnabled !== false
    ? await prisma.pushSubscription.findMany({
        where: { userId: input.userId, enabled: true },
      })
    : [];

  if (!configured || subscriptions.length === 0) {
    const updated = await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'IN_APP_ONLY',
        error: input.pushEnabled === false ? 'Push disabled by preference' : configured ? 'No enabled push subscription' : 'VAPID is not configured',
      },
    });
    return { notification, delivery: updated, duplicate: false };
  }

  let successes = 0;
  const errors: string[] = [];
  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({
          title: input.title,
          body: input.message,
          href: input.href ?? '/notifications',
          tag: input.dedupeKey,
        }),
      );
      successes += 1;
      await prisma.pushSubscription.update({
        where: { id: subscription.id },
        data: { lastSuccessAt: new Date(), failureCount: 0 },
      });
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      errors.push(pushErrorMessage(error));
      await prisma.pushSubscription.update({
        where: { id: subscription.id },
        data: {
          enabled: statusCode === 404 || statusCode === 410 ? false : subscription.enabled,
          failureCount: { increment: 1 },
          lastFailureAt: new Date(),
        },
      });
    }
  }

  const updated = await prisma.notificationDelivery.update({
    where: { id: delivery.id },
    data: {
      status: successes > 0 ? 'SENT' : 'FAILED',
      sentAt: successes > 0 ? new Date() : null,
      error: errors.length ? errors.join(' | ').slice(0, 500) : null,
    },
  });
  return { notification, delivery: updated, duplicate: false };
}
