import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isWeekClosed } from '@/lib/pick-privacy';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function esc(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(...cols: (string | number | null | undefined)[]): string {
  return cols.map(esc).join(',');
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scope = req.nextUrl.searchParams.get('scope') ?? 'all';
  const mode = req.nextUrl.searchParams.get('mode') === 'league' ? 'league' : 'mine';
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  const isCommissioner = dbUser?.role === 'ADMIN';

  // Build the where clause for weeks
  const season = await prisma.season.findFirst({
    where: { isActive: true, isSandbox: false },
  });

  if (!season) {
    return new NextResponse('No active season', { status: 404 });
  }

  const weekWhere =
    scope === 'all'
      ? { seasonId: season.id }
      : { id: scope };

  const weeks = await prisma.week.findMany({
    where: weekWhere,
    orderBy: { weekNumber: 'asc' },
    include: {
      games: { orderBy: { startTime: 'asc' } },
      picks: {
        where: mode === 'mine' ? { userId: session.user.id } : undefined,
        include: {
          user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
        },
      },
      weeklyScores: {
        where: mode === 'mine' ? { userId: session.user.id } : undefined,
        include: {
          user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
        },
        orderBy: { points: 'desc' },
      },
    },
  });

  const now = new Date();
  const exportWeeks = mode === 'mine' || isCommissioner
    ? weeks
    : weeks.filter((week) => isWeekClosed(week.games, now));

  if (mode === 'league' && !isCommissioner && scope !== 'all' && exportWeeks.length === 0) {
    return NextResponse.json(
      { error: 'League-wide exports become available after every game in the selected week has started' },
      { status: 403 },
    );
  }

  const lines: string[] = [];

  // Header
  lines.push(row(
    'Week #',
    'Week Name',
    'Away Team',
    'Home Team',
    'Away Score',
    'Home Score',
    'Game Status',
    'User',
    "User's Pick",
    'Correct',
    'Points Earned',
  ));

  // Picks detail rows
  for (const week of exportWeeks) {
    for (const game of week.games) {
      const status = game.isFinal
        ? 'Final'
        : game.statusState === 'in'
        ? 'Live'
        : game.statusState === 'postponed'
        ? 'Postponed'
        : 'Scheduled';

      const gamePicks = week.picks.filter((p) => p.gameId === game.id);

      if (gamePicks.length === 0) {
        lines.push(row(
          week.weekNumber,
          `Week ${week.weekNumber}`,
          game.awayTeam,
          game.homeTeam,
          game.awayScore ?? '',
          game.homeScore ?? '',
          status,
          '',
          '',
          '',
          '',
        ));
      } else {
        for (const pick of gamePicks) {
          const userName = pick.user.profile?.displayName ?? pick.user.email;
          const correct =
            pick.isCorrect === true ? 'Yes' : pick.isCorrect === false ? 'No' : 'Pending';
          lines.push(row(
            week.weekNumber,
            `Week ${week.weekNumber}`,
            game.awayTeam,
            game.homeTeam,
            game.awayScore ?? '',
            game.homeScore ?? '',
            status,
            userName,
            pick.pickedTeam,
            correct,
            pick.pointsEarned,
          ));
        }
      }
    }
  }

  // Summary section
  lines.push('');
  lines.push('--- SEASON SUMMARY ---');
  lines.push(row('User', 'Total Points', 'Season Rank', 'Weeks Played'));

  const userTotals = new Map<string, { name: string; points: number; weeks: Set<string> }>();
  for (const week of exportWeeks) {
    for (const score of week.weeklyScores) {
      const userName = score.user.profile?.displayName ?? score.user.email;
      if (!userTotals.has(score.userId)) {
        userTotals.set(score.userId, { name: userName, points: 0, weeks: new Set() });
      }
      const entry = userTotals.get(score.userId)!;
      entry.points += score.points;
      entry.weeks.add(week.id);
    }
  }

  const sorted = [...userTotals.values()].sort((a, b) => b.points - a.points);
  sorted.forEach((entry, idx) => {
    lines.push(row(entry.name, entry.points, idx + 1, entry.weeks.size));
  });

  const csv = lines.join('\n');
  const today = new Date().toISOString().split('T')[0];
  const filename = `nfl-picks-${today}.csv`;

  await recordAudit({
    actorId: session.user.id,
    action: 'CSV_EXPORT',
    targetType: 'Season',
    targetId: season.id,
    details: { scope, mode, weekCount: exportWeeks.length },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
