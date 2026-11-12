import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { clientAddress, rateLimitKey } from './rateLimit';
import { normalizeEmail } from './security';

export class MobileError extends Error { constructor(public status: number, message: string) { super(message); } }
const secret = () => {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error('Authentication secret is not configured');
  return value;
};
const mac = (payload: string) => createHmac('sha256', secret()).update(`pickem-mobile-v1:${payload}`).digest('base64url');
const sessionKey = (token: string) => `mobile-session:${createHash('sha256').update(token).digest('hex')}`;
const safeSelect = { id: true, email: true, role: true, sessionVersion: true, mustChangePassword: true, profile: { select: { displayName: true } } } as const;
export type MobileUser = NonNullable<Awaited<ReturnType<typeof authenticateMobile>>>;
export const account = (user: { id: string; email: string; profile: { displayName: string } | null }) => ({ id: user.id, email: user.email, display_name: user.profile?.displayName ?? user.email });

// Shares the existing website login namespaces, with an atomic increment for native attempts.
export async function mobileLimit(key: string, max: number, duration: number) {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" (key, count, "resetAt", "updatedAt")
    VALUES (${key}, 1, clock_timestamp() + ${duration} * interval '1 millisecond', clock_timestamp())
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN "RateLimitBucket"."resetAt" <= clock_timestamp() THEN 1 ELSE "RateLimitBucket".count + 1 END,
    "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= clock_timestamp() THEN clock_timestamp() + ${duration} * interval '1 millisecond' ELSE "RateLimitBucket"."resetAt" END,
    "updatedAt" = clock_timestamp() RETURNING count`;
  if (rows[0].count > max) throw new MobileError(429, 'Too many attempts. Try again later.');
}
export async function issueMobileSession(user: { id: string; sessionVersion: number }) {
  const expires = new Date(Date.now() + 7 * 86400_000);
  const payload = Buffer.from(JSON.stringify({ sub: user.id, v: user.sessionVersion, exp: expires.getTime(), nonce: randomBytes(32).toString('base64url') })).toString('base64url');
  const token = `${payload}.${mac(payload)}`;
  await prisma.rateLimitBucket.create({ data: { key: sessionKey(token), count: user.sessionVersion, resetAt: expires } });
  return token;
}
export async function authenticateMobile(request: Request) {
  const value = request.headers.get('authorization');
  const token = value?.startsWith('Bearer ') ? value.slice(7) : '';
  if (!token || token.length > 2048) throw new MobileError(401, 'Sign in again.');
  const [payload, signature, extra] = token.split('.');
  const expected = mac(payload);
  if (extra || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new MobileError(401, 'Sign in again.');
  let claims;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new MobileError(401, 'Sign in again.'); }
  if (!claims || typeof claims.sub !== 'string' || !Number.isInteger(claims.v) || typeof claims.exp !== 'number' || claims.exp <= Date.now()) throw new MobileError(401, 'Session expired. Sign in again.');
  const [session, user] = await Promise.all([
    prisma.rateLimitBucket.findUnique({ where: { key: sessionKey(token) } }),
    prisma.user.findUnique({ where: { id: claims.sub }, select: safeSelect }),
  ]);
  if (!session || session.resetAt <= new Date() || !user || user.sessionVersion !== claims.v || session.count !== claims.v) throw new MobileError(401, 'Sign in again.');
  return user;
}
export async function revokeMobileSession(request: Request) {
  const token = request.headers.get('authorization')?.slice(7) ?? '';
  await prisma.rateLimitBucket.deleteMany({ where: { key: sessionKey(token) } });
}
export async function mobileLogin(request: Request, body: Record<string, unknown>) {
  const email = normalizeEmail(body.email);
  if (!email || email.length > 254 || typeof body.password !== 'string' || body.password.length > 1024) throw new MobileError(400, 'Enter your email and password.');
  await Promise.all([
    mobileLimit(rateLimitKey('login-ip', clientAddress(request)), 20, 15 * 60_000),
    mobileLimit(rateLimitKey('login-email', email), 8, 15 * 60_000),
  ]);
  const user = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
  // Keep invalid-account responses indistinguishable and perform a password hash comparison.
  const valid = await bcrypt.compare(body.password, user?.password ?? '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
  if (!user || (user.lockedUntil && user.lockedUntil > new Date())) throw new MobileError(401, 'Email or password is incorrect, or the account is temporarily locked.');
  if (!valid) {
    const updated = await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: { increment: 1 } } });
    if (updated.failedLoginAttempts >= 5) await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + 15 * 60_000) } });
    throw new MobileError(401, 'Email or password is incorrect, or the account is temporarily locked.');
  }
  if (user.mustChangePassword) throw new MobileError(403, 'Your commissioner requires a password change. Change it on the website, then sign in here.');
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await prisma.rateLimitBucket.deleteMany({ where: { key: rateLimitKey('login-email', email) } });
  return { token: await issueMobileSession(user), expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(), account: account(user) };
}
