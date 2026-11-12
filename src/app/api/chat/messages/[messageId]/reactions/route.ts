import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED = new Set(['👍', '🔥', '😂', '😮', '😬', '🏈']);

export async function POST(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { messageId } = await params;
  const { emoji } = await request.json();
  if (!ALLOWED.has(emoji)) return NextResponse.json({ error: 'Unsupported reaction' }, { status: 400 });
  const existing = await prisma.chatReaction.findUnique({ where: { messageId_userId_emoji: { messageId, userId: session.user.id, emoji } } });
  if (existing) await prisma.chatReaction.delete({ where: { id: existing.id } });
  else await prisma.chatReaction.create({ data: { messageId, userId: session.user.id, emoji } });
  const reactions = await prisma.chatReaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } });
  return NextResponse.json({ reactions });
}

