import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createPickReminders } from '@/lib/pick-reminders';

export const dynamic = 'force-dynamic';


export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await createPickReminders(session.user.id);
  const notifications = await prisma.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  return NextResponse.json({ notifications, unread: notifications.filter((item) => !item.readAt).length });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const all = body.all === true;
  const id = typeof body.id === 'string' && body.id.length <= 100 ? body.id : null;
  if (!all && !id) return NextResponse.json({ error: 'A notification id or all=true is required' }, { status: 400 });
  await prisma.notification.updateMany({ where: { userId: session.user.id, ...(all ? { readAt: null } : { id }) }, data: { readAt: new Date() } });
  return NextResponse.json({ success: true });
}
