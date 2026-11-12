import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runNFLSync } from '@/lib/nfl-sync';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
  if (user?.role !== 'ADMIN') return null;
  return session;
}

export async function POST() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await runNFLSync();
  await recordAudit({ actorId: session.user.id, action: 'NFL_SYNC', targetType: 'System', details: { ok: result.ok, resultCount: result.results?.length ?? 0 } });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
