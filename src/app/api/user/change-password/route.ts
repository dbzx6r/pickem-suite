import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { checkRateLimit, rateLimitKey } from '@/lib/rateLimit';
import { passwordValidationError } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = await checkRateLimit(rateLimitKey('password-change', session.user.id), {
    maxRequests: 5,
    windowMs: 60 * 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const { password, currentPassword } = await request.json();
  const passwordError = passwordValidationError(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!user.mustChangePassword) {
    const matches = typeof currentPassword === 'string' && await bcrypt.compare(currentPassword, user.password);
    if (!matches) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
  }
  if (await bcrypt.compare(password, user.password)) {
    return NextResponse.json({ error: 'New password must be different from the current password' }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: session.user.id as string },
    data: {
      password: hashedPassword,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
  });

  return NextResponse.json({ success: true });
}
