import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendUserNotification } from '@/lib/push';
import { recordAudit } from '@/lib/audit';

async function commissioner() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  return role?.role === 'ADMIN' ? session : null;
}

async function reminderRows() {
  const season = await prisma.season.findFirst({ where: { isActive: true, isSandbox: false } });
  const week = season ? await prisma.week.findFirst({ where: { seasonId: season.id, isFinal: false }, orderBy: { weekNumber: 'asc' }, include: { games: { orderBy: { startTime: 'asc' } } } }) : null;
  if (!week) return { season, week: null, participants: [] };
  const now = new Date();
  const openGames = week.games.filter((game) => game.startTime > now);
  const users = await prisma.user.findMany({
    where: { role: 'USER' },
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true, notificationPreferences: true } },
      picks: { where: { weekId: week.id }, select: { gameId: true } },
      tiebreakers: { where: { weekId: week.id }, select: { id: true } },
      pushSubscriptions: { where: { enabled: true }, select: { id: true } },
      notificationDeliveries: { where: { weekId: week.id, type: 'COMMISSIONER_PICK_REMINDER' }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, status: true } },
    },
  });
  return {
    season,
    week: { id: week.id, weekNumber: week.weekNumber, totalOpenGames: openGames.length, tiebreakerGameId: week.tiebreakerGameId },
    participants: users.map((user) => {
      const picked = new Set(user.picks.map((pick) => pick.gameId));
      const missing = openGames.filter((game) => !picked.has(game.id)).map((game) => ({ id: game.id, matchup: `${game.awayTeam} at ${game.homeTeam}`, locksAt: game.startTime }));
      const missingTiebreaker = Boolean(
        week.tiebreakerGameId &&
        openGames.some((game) => game.id === week.tiebreakerGameId) &&
        user.tiebreakers.length === 0,
      );
      const preferences = (user.profile?.notificationPreferences ?? {}) as { pickReminders?: boolean };
      return {
        userId: user.id,
        displayName: user.profile?.displayName ?? user.email.split('@')[0],
        complete: missing.length === 0 && !missingTiebreaker,
        missing,
        missingTiebreaker,
        pushEligible: preferences.pickReminders !== false && user.pushSubscriptions.length > 0,
        lastSent: user.notificationDeliveries[0] ?? null,
      };
    }).sort((a, b) => Number(a.complete) - Number(b.complete) || a.displayName.localeCompare(b.displayName)),
  };
}

export async function GET() {
  if (!await commissioner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await reminderRows(), { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const session = await commissioner();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const requested = Array.isArray(body.userIds) ? body.userIds.filter((id: unknown): id is string => typeof id === 'string') : [];
  const data = await reminderRows();
  if (!data.week) return NextResponse.json({ error: 'No active week' }, { status: 404 });
  const targets = data.participants.filter((participant) => !participant.complete && requested.includes(participant.userId));
  if (!targets.length || targets.length > 100) return NextResponse.json({ error: 'Select at least one incomplete participant' }, { status: 400 });
  const batchId = crypto.randomUUID();
  for (const participant of targets) {
    const nextMissing = participant.missing[0];
    const missingParts = [
      participant.missing.length ? `${participant.missing.length} open pick${participant.missing.length === 1 ? '' : 's'}` : '',
      participant.missingTiebreaker ? 'tiebreaker' : '',
    ].filter(Boolean);
    await sendUserNotification({
      userId: participant.userId,
      type: 'COMMISSIONER_PICK_REMINDER',
      title: `Week ${data.week.weekNumber} picks are incomplete`,
      message: `${missingParts.join(' and ')} missing${nextMissing ? `; next is ${nextMissing.matchup}` : ''}.`,
      href: `/picks/${data.week.weekNumber}`,
      dedupeKey: `commissioner-reminder:${batchId}:${participant.userId}`,
      weekId: data.week.id,
      gameId: nextMissing?.id ?? data.week.tiebreakerGameId ?? undefined,
      pushEnabled: participant.pushEligible,
    });
  }
  await recordAudit({ actorId: session.user.id, action: 'COMMISSIONER_PICK_REMINDER', targetType: 'Week', targetId: data.week.id, details: { targetCount: targets.length, batchId } });
  return NextResponse.json({ success: true, sent: targets.length });
}
