import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { normalizeEmail, passwordValidationError } from '@/lib/security';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const safeUserSelect = {
  id: true,
  email: true,
  role: true,
  mustChangePassword: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  profile: { select: { displayName: true, avatarUrl: true } },
  weeklyScores: { select: { points: true } },
} as const;

async function requireCommissioner() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  return user?.role === 'ADMIN' ? session : null;
}

export async function GET() {
  const session = await requireCommissioner();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const users = await prisma.user.findMany({ select: safeUserSelect, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ users });
}

export async function DELETE(request: NextRequest) {
  const session = await requireCommissioner();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId, confirmation } = await request.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (userId === session.user.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.role === 'ADMIN') {
    return NextResponse.json({ error: 'Revoke commissioner access before deleting this account' }, { status: 409 });
  }
  const expected = `DELETE ${target.profile?.displayName ?? target.email}`;
  if (confirmation !== expected) {
    return NextResponse.json({ error: `Type “${expected}” to confirm` }, { status: 400 });
  }

  await recordAudit({ actorId: session.user.id, action: 'USER_DELETE', targetType: 'User', targetId: userId, details: { email: target.email } });
  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const session = await requireCommissioner();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const email = normalizeEmail(body.email);
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const passwordError = passwordValidationError(body.password);
  if (!email || !displayName || passwordError) {
    return NextResponse.json({ error: passwordError ?? 'email and displayName are required' }, { status: 400 });
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(body.password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.create({ data: { displayName } });
    return tx.user.create({
      data: {
        email,
        password: hashedPassword,
        role: body.role === 'ADMIN' ? 'ADMIN' : 'USER',
        profileId: profile.id,
        mustChangePassword: true,
      },
      select: safeUserSelect,
    });
  });
  await recordAudit({ actorId: session.user.id, action: 'USER_CREATE', targetType: 'User', targetId: user.id, details: { role: user.role } });
  return NextResponse.json({ user }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await requireCommissioner();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  if (body.action === 'set_role') {
    const role = body.role === 'ADMIN' ? 'ADMIN' : 'USER';
    if (userId === session.user.id && role !== 'ADMIN') {
      return NextResponse.json({ error: 'You cannot revoke your own commissioner access' }, { status: 400 });
    }
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (target.role === 'ADMIN' && role === 'USER') {
      const commissionerCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (commissionerCount <= 1) return NextResponse.json({ error: 'At least one commissioner is required' }, { status: 409 });
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role, sessionVersion: { increment: 1 } },
      select: safeUserSelect,
    });
    await recordAudit({ actorId: session.user.id, action: role === 'ADMIN' ? 'COMMISSIONER_GRANT' : 'COMMISSIONER_REVOKE', targetType: 'User', targetId: userId });
    return NextResponse.json({ success: true, user });
  }

  const passwordError = passwordValidationError(body.newPassword);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  const hashedPassword = await bcrypt.hash(body.newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      sessionVersion: { increment: 1 },
    },
  });
  await recordAudit({ actorId: session.user.id, action: 'PASSWORD_RESET', targetType: 'User', targetId: userId });
  return NextResponse.json({ success: true });
}
