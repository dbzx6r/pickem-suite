import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
  if (user?.role !== 'ADMIN') return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ announcements });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { message, isActive } = await request.json();
  if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

  const announcement = await prisma.announcement.create({
    data: { message, isActive: isActive ?? true, adminId: session.user.id as string },
  });

  return NextResponse.json({ announcement });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, isActive, message } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const announcement = await prisma.announcement.update({
    where: { id },
    data: { ...(isActive !== undefined && { isActive }), ...(message && { message }) },
  });

  return NextResponse.json({ announcement });
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await request.json();
  await prisma.announcement.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
