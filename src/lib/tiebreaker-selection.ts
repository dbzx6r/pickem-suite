import { prisma } from '@/lib/prisma';
import { lastTiebreakerGame } from './tiebreaker-policy';

export async function selectWeeklyTiebreaker(weekId: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tiebreaker:${weekId}`}))`;
    const week = await tx.week.findUnique({ where: { id: weekId }, include: { games: true, season: true } });
    if (!week || week.isFinal || week.season.isSandbox) return;
    if (week.tiebreakerGameId && await tx.auditLog.findUnique({where:{id:`game-lock:${week.tiebreakerGameId}`}})) return;
    const selected = lastTiebreakerGame(week.games, week.tiebreakerGameId, week.isFinal);
    if (!selected || selected.id === week.tiebreakerGameId) return;
    await tx.week.update({ where: { id: week.id }, data: { tiebreakerGameId: selected.id } });
    const audit = await tx.auditLog.create({ data: {
      action: 'TIEBREAKER_LAST_GAME_SELECTED', targetType: 'Week', targetId: week.id,
      details: { previousGameId: week.tiebreakerGameId, gameId: selected.id,
        kickoff: selected.startTime.toISOString(), rule: 'Latest scheduled kickoff; existing choice preferred on tied kickoffs, then stable game ID' },
    } });
    // Keep participants' numbers, but explicitly tell existing entrants to review
    // them after a matchup change. No phone push or notifications for empty weeks.
    if (week.tiebreakerGameId) {
      const entries = await tx.tiebreaker.findMany({ where: { weekId }, select: { userId: true } });
      await tx.notification.createMany({ data: entries.map(entry => ({
        userId: entry.userId, type: 'TIEBREAKER_GAME_CHANGED',
        title: `Week ${week.weekNumber} tiebreaker matchup updated`,
        message: `The tiebreaker is now ${selected.awayTeam} at ${selected.homeTeam}, the week's last scheduled game. Your saved number was kept; review it before this game starts.`,
        href: `/picks/${week.weekNumber}`, dedupeKey: `${audit.id}:${entry.userId}`,
      })), skipDuplicates: true });
    }
    return selected.id;
  });
}
