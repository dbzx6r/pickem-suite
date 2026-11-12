import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function recordAudit(input: {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({ data: input });
}
