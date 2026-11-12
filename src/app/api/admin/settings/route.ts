import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';

async function commissioner() { const session = await auth(); if (!session?.user?.id) return null; const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }); return user?.role === 'ADMIN' ? session : null; }
export async function GET() { const session = await commissioner(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const settings = await prisma.leagueSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} }); return NextResponse.json({ settings }); }
export async function PATCH(request: NextRequest) {
  const session = await commissioner(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const data = {
    leagueName: typeof body.leagueName === 'string' ? body.leagueName.trim().slice(0, 60) || 'NFL Picks' : 'NFL Picks',
    pickWindowWeeks: Math.min(4, Math.max(1, Number(body.pickWindowWeeks) || 2)),
    picksRevealPolicy: 'GAME_START',
    registrationEnabled: Boolean(body.registrationEnabled),
    chatEnabled: Boolean(body.chatEnabled),
    reminderHours: Math.min(168, Math.max(1, Number(body.reminderHours) || 24)),
    reminderMinutes: [...new Set((typeof body.reminderMinutes === 'string' ? body.reminderMinutes : '').split(',').map(Number).filter((value: number) => Number.isInteger(value) && value >= 5 && value <= 10080))].slice(0, 8).join(',') || '1440,60,15',
    newsEnabled: Boolean(body.newsEnabled),
  };
  const settings = await prisma.leagueSettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
  await recordAudit({ actorId: session.user.id, action: 'LEAGUE_SETTINGS_UPDATE', targetType: 'LeagueSettings', targetId: 'default', details: data });
  return NextResponse.json({ settings });
}
