import { prisma } from '@/lib/prisma';
import { absoluteSpread, closestSpreadGame, doublePointsDeadline, DOUBLE_POINTS_POLICY_START } from './double-points-policy';

// Existing AuditLog provides a durable unique selection record without a schema migration.
// Selection, snapshot and in-app announcements commit together, or not at all.
export async function selectWeeklyDoubleGame(weekId: string, freshOdds?: Map<string, string | null>) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`double-points:${weekId}`}))`;
    const week = await tx.week.findUnique({ where: { id: weekId }, include: { games: true, season: true } });
    if (!week || week.isFinal || week.season.isSandbox || !week.season.isActive || !week.games.length) return;
    const first = new Date(Math.min(...week.games.map(g => g.startTime.getTime())));
    const due = doublePointsDeadline(first);
    if (due < DOUBLE_POINTS_POLICY_START) return; // Never rewrite previously announced weeks.
    const key = `double-points:${week.id}`;
    if (await tx.auditLog.findUnique({ where: { id: key } })) return;
    const now = new Date();
    if (week.games.some(g => g.isFinal || g.startTime <= now || (g.statusState && g.statusState !== 'pre'))) return;
    if (now < due) {
      if (week.doubleGameId) await tx.week.update({ where: { id: week.id }, data: { doubleGameId: null } });
      return;
    }
    // Only fresh lines from this successful ESPN fetch can decide the winner.
    if (!freshOdds) return;
    const games = week.games.map(g => ({ ...g, spreadLine: freshOdds.get(g.espnGameId ?? '') ?? null }));
    const selected = closestSpreadGame(games, now);
    if (!selected) return; // Retry next sync, never fall back to a random game.
    await tx.week.update({ where: { id: week.id }, data: { doubleGameId: selected.id } });
    await tx.auditLog.create({ data: { id: key, action: 'DOUBLE_POINTS_LOCKED', targetType: 'Week', targetId: week.id,
      details: { gameId: selected.id, spreadLine: selected.spreadLine, absoluteSpread: absoluteSpread(selected.spreadLine),
        provider: selected.oddsProvider, scheduledAt: due.toISOString(), selectedAt: now.toISOString(),
        rule: 'Closest available absolute spread; equal lines: earliest kickoff, then game ID' } } });
    const users = await tx.user.findMany({ select: { id: true } });
    await tx.notification.createMany({ data: users.map(user => ({ userId: user.id,
      type: 'DOUBLE_POINTS_LOCKED', title: `Week ${week.weekNumber} double-points game locked`,
      message: `${selected.awayTeam} at ${selected.homeTeam} earns 2× points. Spread at selection: ${selected.spreadLine}. Closest available spread; this selection will not change with the odds.`,
      href: `/picks/${week.weekNumber}`, dedupeKey: `${key}:${user.id}`,
    })), skipDuplicates: true });
    return selected.id;
  });
}
