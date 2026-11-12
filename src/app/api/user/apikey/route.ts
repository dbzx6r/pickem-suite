import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { apiKey: true } });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Auto-generate if null
  if (!user.apiKey) {
    user = await prisma.user.update({
      where: { id: session.user.id },
      data: { apiKey: crypto.randomUUID() },
      select: { apiKey: true },
    });
  }

  return NextResponse.json({ apiKey: user.apiKey });
}

export async function PATCH() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { apiKey: crypto.randomUUID() },
    select: { apiKey: true },
  });

  return NextResponse.json({ apiKey: user.apiKey });
}
