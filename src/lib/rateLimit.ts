import { prisma } from '@/lib/prisma';

export type RateLimitResult = { allowed: boolean; retryAfter?: number };

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  return forwarded.trim().slice(0, 64);
}

export function rateLimitKey(namespace: string, value: string): string {
  const normalized = value.toLowerCase();
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < normalized.length; index++) {
    first = Math.imul(first ^ normalized.charCodeAt(index), 16777619);
    second = Math.imul(second ^ normalized.charCodeAt(index), 3266489917);
  }
  const digest = `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  return `${namespace}:${digest}`;
}

export async function checkRateLimit(
  key: string,
  options: { maxRequests?: number; windowMs?: number } = {},
): Promise<RateLimitResult> {
  const maxRequests = options.maxRequests ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  return prisma.$transaction(async (tx) => {
    const bucket = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!bucket || bucket.resetAt <= now) {
      await tx.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return { allowed: true };
    }
    if (bucket.count >= maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000)),
      };
    }
    await tx.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
    return { allowed: true };
  });
}

export async function clearRateLimit(key: string): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
}
