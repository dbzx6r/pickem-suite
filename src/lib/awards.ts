import type { PrismaClient } from '@prisma/client';

function parseFavoredTeam(
  spreadLine: string | null,
  homeTeam: string,
): string | null {
  if (!spreadLine) return null;

  // "TEAM -X.X" or "TEAM-X.X"
  const teamFirst = spreadLine.match(/^([A-Z0-9 ]+?)\s*-[\d.]+/i);
  if (teamFirst) return teamFirst[1].trim();

  // "-X.X TEAM"
  const numFirst = spreadLine.match(/^-[\d.]+\s+([A-Z0-9 ]+)/i);
  if (numFirst) return numFirst[1].trim();

  // Bare negative number — home team is favored by convention
  if (/^-[\d.]+$/.test(spreadLine.trim())) return homeTeam;

  return null;
}

export async function computeWeekAwards(
  weekId: string,
  prisma: PrismaClient
): Promise<void> {
  const scores = await prisma.weeklyScore.findMany({
    where: { weekId },
    include: { user: { include: { profile: true } } },
  });

  if (scores.length === 0) return;

  const picks = await prisma.pick.findMany({
    where: { weekId },
    include: { game: true },
  });

  // Group picks by userId
  const picksByUser: Record<string, typeof picks> = {};
  for (const pick of picks) {
    if (!picksByUser[pick.userId]) picksByUser[pick.userId] = [];
    picksByUser[pick.userId].push(pick);
  }

  // ── most_accurate ──────────────────────────────────────────────────────────
  let mostAccurateUserId: string | null = null;
  let mostAccurateMeta: { pct: number; correct: number; total: number } | null = null;

  for (const [userId, userPicks] of Object.entries(picksByUser)) {
    const total = userPicks.length;
    if (total < 5) continue;
    const correct = userPicks.filter((p) => p.isCorrect === true).length;
    const pct = (correct / total) * 100;
    if (
      !mostAccurateMeta ||
      pct > mostAccurateMeta.pct ||
      (pct === mostAccurateMeta.pct && total > mostAccurateMeta.total)
    ) {
      mostAccurateUserId = userId;
      mostAccurateMeta = { pct, correct, total };
    }
  }

  if (mostAccurateUserId && mostAccurateMeta) {
    await prisma.slateAward.upsert({
      where: { weekId_awardType: { weekId, awardType: 'most_accurate' } },
      create: {
        weekId,
        userId: mostAccurateUserId,
        awardType: 'most_accurate',
        metadata: mostAccurateMeta,
      },
      update: { userId: mostAccurateUserId, metadata: mostAccurateMeta },
    });
  }

  // ── upset_specialist ───────────────────────────────────────────────────────
  const underdogWins: Record<string, number> = {};

  for (const pick of picks) {
    const { game } = pick;
    const favored = parseFavoredTeam(game.spreadLine, game.homeTeam);
    if (!favored) continue;
    const underdog =
      favored.toUpperCase() === game.homeTeam.toUpperCase()
        ? game.awayTeam
        : game.homeTeam;
    if (pick.pickedTeam === underdog && pick.isCorrect === true) {
      underdogWins[pick.userId] = (underdogWins[pick.userId] ?? 0) + 1;
    }
  }

  let upsetUserId: string | null = null;
  let upsetCount = 0;

  for (const [userId, count] of Object.entries(underdogWins)) {
    if (count > upsetCount) {
      upsetUserId = userId;
      upsetCount = count;
    }
  }

  if (upsetUserId && upsetCount >= 1) {
    await prisma.slateAward.upsert({
      where: { weekId_awardType: { weekId, awardType: 'upset_specialist' } },
      create: {
        weekId,
        userId: upsetUserId,
        awardType: 'upset_specialist',
        metadata: { count: upsetCount },
      },
      update: { userId: upsetUserId, metadata: { count: upsetCount } },
    });
  }

  // ── on_fire ────────────────────────────────────────────────────────────────
  let onFireUserId: string | null = null;
  let onFirePickCount = 0;

  for (const [userId, userPicks] of Object.entries(picksByUser)) {
    if (userPicks.length < 5) continue;
    if (!userPicks.every((p) => p.isCorrect === true)) continue;
    if (userPicks.length > onFirePickCount) {
      onFireUserId = userId;
      onFirePickCount = userPicks.length;
    }
  }

  if (onFireUserId) {
    await prisma.slateAward.upsert({
      where: { weekId_awardType: { weekId, awardType: 'on_fire' } },
      create: {
        weekId,
        userId: onFireUserId,
        awardType: 'on_fire',
        metadata: { picks: onFirePickCount },
      },
      update: { userId: onFireUserId, metadata: { picks: onFirePickCount } },
    });
  }

  // ── first_in ───────────────────────────────────────────────────────────────
  // Winner = user whose LAST pick was submitted earliest (first to complete)
  let firstInUserId: string | null = null;
  let firstInCompletedAt: Date | null = null;

  for (const [userId, userPicks] of Object.entries(picksByUser)) {
    if (userPicks.length < 3) continue;
    const lastPickAt = userPicks.reduce<Date>((max, p) => {
      const t = new Date(p.createdAt);
      return t > max ? t : max;
    }, new Date(0));
    if (!firstInCompletedAt || lastPickAt < firstInCompletedAt) {
      firstInUserId = userId;
      firstInCompletedAt = lastPickAt;
    }
  }

  if (firstInUserId && firstInCompletedAt) {
    await prisma.slateAward.upsert({
      where: { weekId_awardType: { weekId, awardType: 'first_in' } },
      create: {
        weekId,
        userId: firstInUserId,
        awardType: 'first_in',
        metadata: { completedAt: firstInCompletedAt.toISOString() },
      },
      update: {
        userId: firstInUserId,
        metadata: { completedAt: firstInCompletedAt.toISOString() },
      },
    });
  }

  // ── tough_break ────────────────────────────────────────────────────────────
  // Highest accuracy among users who finished last (highest finalRank number)
  const maxRank = scores.reduce((max, s) => Math.max(max, s.finalRank ?? 0), 0);
  if (maxRank > 0) {
    let toughBreakUserId: string | null = null;
    let toughBreakMeta: { pct: number; rank: number } | null = null;

    for (const score of scores) {
      if ((score.finalRank ?? 0) !== maxRank) continue;
      const userPicks = picksByUser[score.userId] ?? [];
      if (userPicks.length === 0) continue;
      const correct = userPicks.filter((p) => p.isCorrect === true).length;
      const pct = (correct / userPicks.length) * 100;
      if (pct < 50) continue;
      if (!toughBreakMeta || pct > toughBreakMeta.pct) {
        toughBreakUserId = score.userId;
        toughBreakMeta = { pct, rank: maxRank };
      }
    }

    if (toughBreakUserId && toughBreakMeta) {
      await prisma.slateAward.upsert({
        where: { weekId_awardType: { weekId, awardType: 'tough_break' } },
        create: {
          weekId,
          userId: toughBreakUserId,
          awardType: 'tough_break',
          metadata: toughBreakMeta,
        },
        update: { userId: toughBreakUserId, metadata: toughBreakMeta },
      });
    }
  }
}
