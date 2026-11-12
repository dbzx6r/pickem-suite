import { NextRequest, NextResponse } from 'next/server';
import { runNFLSync } from '@/lib/nfl-sync';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runNFLSync();
  await recordAudit({ action: 'NFL_SYNC_CRON', targetType: 'System', details: { ok: result.ok, resultCount: result.results?.length ?? 0 } });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
