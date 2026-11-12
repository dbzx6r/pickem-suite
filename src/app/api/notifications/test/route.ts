import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { sendUserNotification } from '@/lib/push';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rateLimit = await checkRateLimit(`notification-test:${session.user.id}`, { maxRequests: 3, windowMs: 10 * 60_000 });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Please wait before sending another test' }, { status: 429 });

  const result = await sendUserNotification({
    userId: session.user.id,
    type: 'TEST_NOTIFICATION',
    title: 'NFL Picks test alert',
    message: 'Notifications are working for your account.',
    href: '/notifications',
    dedupeKey: `notification-test:${session.user.id}:${Date.now()}`,
  });

  return NextResponse.json({
    success: true,
    channel: result.delivery.status === 'SENT' ? 'push' : 'in-app',
    status: result.delivery.status,
  });
}
