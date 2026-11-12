import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, clientAddress, rateLimitKey } from '@/lib/rateLimit';
import { normalizeEmail, passwordValidationError } from '@/lib/security';

export async function POST(request: Request) {
  const settings = await prisma.leagueSettings.findUnique({ where: { id: 'default' } });
  if (process.env.ALLOW_REGISTRATION !== 'true' && !settings?.registrationEnabled) {
    return NextResponse.json(
      { error: 'Registration is closed. Contact an admin to create an account.' },
      { status: 403 }
    );
  }

  try {
    const limit = await checkRateLimit(rateLimitKey('register-ip', clientAddress(request)), {
      maxRequests: 5,
      windowMs: 60 * 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
      );
    }

    const body = await request.json();
    const email = normalizeEmail(body.email);
    const password = body.password;
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';

    if (!email || !password || !displayName) {
      return NextResponse.json(
        { error: 'Email, password, and display name are required' },
        { status: 400 }
      );
    }

    const passwordError = passwordValidationError(password);
    if (passwordError) {
      return NextResponse.json(
        { error: passwordError },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.$transaction(async (tx) => {
      const profile = await tx.profile.create({ data: { displayName } });
      await tx.user.create({
        data: { email, password: hashedPassword, role: 'USER', profileId: profile.id, passwordChangedAt: new Date() },
      });
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
