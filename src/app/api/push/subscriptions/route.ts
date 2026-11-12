import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const authKey = typeof body.keys?.auth === 'string' ? body.keys.auth : '';
  if (!endpoint || !p256dh || !authKey || endpoint.length > 2000) {
    return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
  }
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: session.user.id,
      p256dh,
      auth: authKey,
      enabled: true,
      failureCount: 0,
      userAgent: request.headers.get('user-agent')?.slice(0, 500),
    },
    create: {
      userId: session.user.id,
      endpoint,
      p256dh,
      auth: authKey,
      userAgent: request.headers.get('user-agent')?.slice(0, 500),
    },
  });
  return NextResponse.json({ subscription: { id: subscription.id, enabled: subscription.enabled } });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const endpoint = request.nextUrl.searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
  await prisma.pushSubscription.updateMany({
    where: { userId: session.user.id, endpoint },
    data: { enabled: false },
  });
  return NextResponse.json({ success: true });
}

