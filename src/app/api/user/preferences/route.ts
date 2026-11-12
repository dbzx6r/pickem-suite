import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NFL_TEAMS } from '@/lib/espn';

import { THEMES as THEME_OPTIONS } from '@/lib/themes';
const THEMES = new Set<string>(THEME_OPTIONS.map(theme => theme.id));

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { profile: { select: { theme: true, favoriteTeam: true, notificationPreferences: true, reducedMotion: true } } } });
  return NextResponse.json({ preferences: user?.profile });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const theme = THEMES.has(body.theme) ? body.theme : 'midnight';
  const favoriteTeam = typeof body.favoriteTeam === 'string' && NFL_TEAMS[body.favoriteTeam] ? body.favoriteTeam : null;
  const notificationPreferences = body.notificationPreferences && typeof body.notificationPreferences === 'object' ? body.notificationPreferences : {};
  const reducedMotion = Boolean(body.reducedMotion);
  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { profile: { update: { theme, favoriteTeam, notificationPreferences, reducedMotion } } },
    select: { profile: { select: { theme: true, favoriteTeam: true, notificationPreferences: true, reducedMotion: true } } },
  });
  return NextResponse.json({ preferences: user.profile });
}
