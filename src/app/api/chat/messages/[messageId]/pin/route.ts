import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const actor = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (actor?.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { messageId } = await params;
  const body = await request.json();
  const pinned = Boolean(body.pinned);
  const message = await prisma.chatMessage.update({ where: { id: messageId }, data: { pinnedAt: pinned ? new Date() : null, pinnedById: pinned ? session.user.id : null } });
  await recordAudit({ actorId: session.user.id, action: pinned ? 'CHAT_MESSAGE_PIN' : 'CHAT_MESSAGE_UNPIN', targetType: 'ChatMessage', targetId: messageId });
  return NextResponse.json({ message });
}
