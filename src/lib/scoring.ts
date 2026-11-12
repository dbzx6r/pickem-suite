import { prisma } from '@/lib/prisma';
import { checkAndAwardAchievements } from '@/lib/achievements';
import { rankWeeklyEntries } from '@/lib/ranking';
import { gradeFinalPick } from './pick-scoring';

export async function calculateWeeklyScores(weekId: string): Promise<void> {
  const week = await prisma.week.findUnique({
    where: { id: weekId },
    include: {
      games: true,
      picks: { include: { user: true, game: true } },
      tiebreakers: true,
    },
  });

  if (!week) throw new Error('Week not found');

  // Step 1: Update each pick with isCorrect and pointsEarned
  for (const pick of week.picks) {
    const game = pick.game;
    const grade = gradeFinalPick(game, pick.pickedTeam, week.doubleGameId);
    if (!grade) continue;

    await prisma.pick.update({
      where: { id: pick.id },
      data: grade,
    });
  }

  // Step 2: Get all final games
  const finalGames = week.games.filter((g) => g.isFinal);
  if (finalGames.length === 0) return;

  // Step 3: Calculate per-user totals
  const userPoints: Record<string, number> = {};
  const updatedPicks = await prisma.pick.findMany({
    where: { weekId },
    include: { user: true },
  });

  for (const pick of updatedPicks) {
    if (!userPoints[pick.userId]) userPoints[pick.userId] = 0;
    userPoints[pick.userId] += pick.pointsEarned;
  }

  // Step 4: Update tiebreaker differences if tiebreaker game is final
  const tiebreakerGame = week.games.find((g) => g.id === week.tiebreakerGameId);
  if (tiebreakerGame?.isFinal && tiebreakerGame.homeScore !== null && tiebreakerGame.awayScore !== null) {
    const actualTotal = tiebreakerGame.homeScore + tiebreakerGame.awayScore;
    for (const tb of week.tiebreakers) {
      const difference = Math.abs(tb.guessedTotal - actualTotal);
      await prisma.tiebreaker.update({
        where: { id: tb.id },
        data: { difference },
      });
    }
  }

  // Step 5: Get updated tiebreakers
  const updatedTiebreakers = await prisma.tiebreaker.findMany({
    where: { weekId },
  });
  const tiebreakerMap: Record<string, number | null> = {};
  for (const tb of updatedTiebreakers) {
    tiebreakerMap[tb.userId] = tb.difference;
  }

  // Load any existing admin overrides so they survive re-scoring
  const existingScores = await prisma.weeklyScore.findMany({ where: { weekId } });
  const overrideMap: Record<string, { points: number | null; note: string | null }> = {};
  for (const s of existingScores) {
    overrideMap[s.userId] = {
      points: s.adminOverridePoints ?? null,
      note: s.adminOverrideNote ?? null,
    };
  }

  // Step 6: Rank by points, then tiebreaker difference, then a stable
  // deterministic hash for true ties. Missing tiebreakers sort last.
  const userIds = Object.keys(userPoints);
  const userList = rankWeeklyEntries(weekId, userIds.map((userId) => {
    const rawPoints = userPoints[userId] || 0;
    const override = overrideMap[userId]?.points;
    return {
      userId,
      points: rawPoints,
      effectivePoints: override !== null && override !== undefined ? override : rawPoints,
      tbDiff: tiebreakerMap[userId] ?? null,
    };
  }));

  // Step 7: Preserve a human-readable audit for every deterministic true-tie pair.
  for (let i = 0; i < userList.length; i += 1) {
    for (let j = i + 1; j < userList.length; j += 1) {
      const first = userList[i];
      const second = userList[j];
      if (!first.randomTiebroken || first.effectivePoints !== second.effectivePoints || first.tbDiff !== second.tbDiff) continue;
      const existing = await prisma.tiebreakerAudit.findFirst({ where: { weekId, OR: [{ userId1: first.userId, userId2: second.userId }, { userId1: second.userId, userId2: first.userId }] } });
      if (!existing) await prisma.tiebreakerAudit.create({ data: { weekId, userId1: first.userId, userId2: second.userId, winnerId: first.userId, randomSeed: `deterministic:${weekId}` } });
    }
  }

  // Step 8: Upsert WeeklyScore records
  for (const entry of userList) {
    const override = overrideMap[entry.userId];
    await prisma.weeklyScore.upsert({
      where: { userId_weekId: { userId: entry.userId, weekId } },
      update: {
        points: entry.points,
        tiebreakerUsed: entry.tiebreakerUsed,
        finalRank: entry.finalRank,
        randomTiebroken: entry.randomTiebroken,
        // Preserve existing override — do not clear it on rescore
        adminOverridePoints: override?.points ?? null,
        adminOverrideNote: override?.note ?? null,
      },
      create: {
        userId: entry.userId,
        weekId,
        points: entry.points,
        tiebreakerUsed: entry.tiebreakerUsed,
        finalRank: entry.finalRank,
        randomTiebroken: entry.randomTiebroken,
        adminOverridePoints: override?.points ?? null,
        adminOverrideNote: override?.note ?? null,
      },
    });
  }

  for (const entry of userList) {
    await checkAndAwardAchievements(entry.userId, prisma, weekId);
  }
}

export async function getLeaderboard(isSandbox = false) {
  const activeSeason = await prisma.season.findFirst({
    where: isSandbox ? { isSandbox: true } : { isActive: true, isSandbox: false },
  });

  const users = await prisma.user.findMany({
    where: { role: 'USER' },
    include: {
      profile: true,
      weeklyScores: {
        where: { week: { seasonId: activeSeason?.id ?? '__no_active_season__' } },
        include: { week: true },
        orderBy: { week: { weekNumber: 'asc' } },
      },
      picks: {
        where: {
          isCorrect: { not: null },
          week: { seasonId: activeSeason?.id ?? '__no_active_season__' },
        },
      },
    },
  });

  return users.map((user) => {
    const totalPoints = user.weeklyScores.reduce((sum, ws) => sum + (ws.adminOverridePoints ?? ws.points), 0);
    const bestWeek = Math.max(0, ...user.weeklyScores.map((ws) => ws.adminOverridePoints ?? ws.points));
    const correctPicks = user.picks.filter((p) => p.isCorrect === true).length;
    const totalPicks = user.picks.filter((p) => p.isCorrect !== null).length;
    const pickPercentage = totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 100) : 0;

    // Calculate streak
    const sortedScores = [...user.weeklyScores].sort(
      (a, b) => b.week.weekNumber - a.week.weekNumber
    );
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    
    // Streak = consecutive weeks where user ranked #1
    for (const score of sortedScores) {
      if (score.finalRank === 1) {
        currentStreak++;
        tempStreak++;
        bestStreak = Math.max(bestStreak, tempStreak);
      } else {
        if (currentStreak > 0) break;
        tempStreak = 0;
      }
    }

    // Cumulative points by week
    const weeklyData = user.weeklyScores.map((ws) => ({
      week: ws.week.weekNumber,
      points: ws.adminOverridePoints ?? ws.points,
      rank: ws.finalRank,
    }));

    return {
      id: user.id,
      email: user.email,
      displayName: user.profile?.displayName ?? user.email.split('@')[0],
      avatarUrl: user.profile?.avatarUrl ?? null,
      favoriteTeam: user.profile?.favoriteTeam ?? null,
      scoreBreakdown: user.weeklyScores.map(s => {
        const scored = user.picks.filter(p => p.weekId === s.weekId);
        return { weekId: s.weekId, week: s.week.weekNumber, final: s.week.isFinal,
          correct: scored.filter(p => p.isCorrect === true).length,
          bonus: scored.reduce((sum,p) => sum + Math.max(0,p.pointsEarned - (p.isCorrect ? 1 : 0)),0),
          raw: s.points, effective: s.adminOverridePoints ?? s.points,
          rank: s.finalRank, tiebreakerUsed: s.tiebreakerUsed, trueTie: s.randomTiebroken };
      }),
      totalPoints,
      bestWeek,
      pickPercentage,
      currentStreak,
      bestStreak,
      weeklyData,
      weeksWon: user.weeklyScores.filter((ws) => ws.finalRank === 1).length,
    };
  });
}

export async function getUserStats(userId: string, viewerId: string = userId) {
  const activeSeason = await prisma.season.findFirst({
    where: { isActive: true, isSandbox: false },
  });
  const activeSeasonId = activeSeason?.id ?? '__no_active_season__';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      weeklyScores: {
        where: { week: { seasonId: activeSeasonId } },
        include: { week: { include: { games: true } } },
        orderBy: { week: { weekNumber: 'asc' } },
      },
      picks: {
        where: {
          week: { seasonId: activeSeasonId },
          ...(viewerId === userId ? {} : { game: { startTime: { lte: new Date() } } }),
        },
        include: { game: true, week: true },
        orderBy: { createdAt: 'desc' },
      },
      tiebreakers: {
        where: { week: { seasonId: activeSeasonId } },
        include: { week: true },
      },
    },
  });

  if (!user) return null;

  const totalPoints = user.weeklyScores.reduce((sum, ws) => sum + (ws.adminOverridePoints ?? ws.points), 0);
  const bestWeek = Math.max(0, ...user.weeklyScores.map((ws) => ws.adminOverridePoints ?? ws.points));
  const correctPicks = user.picks.filter((p) => p.isCorrect === true).length;
  const totalPicks = user.picks.filter((p) => p.isCorrect !== null).length;
  const pickPercentage = totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 100) : 0;

  // Build cumulative points
  let cumulative = 0;
  const cumulativeData = user.weeklyScores.map((ws) => {
    const effectivePoints = ws.adminOverridePoints ?? ws.points;
    cumulative += effectivePoints;
    return { week: ws.week.weekNumber, points: effectivePoints, cumulative, rank: ws.finalRank };
  });

  // Streaks
  const sortedScores = [...user.weeklyScores].sort(
    (a, b) => b.week.weekNumber - a.week.weekNumber
  );
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;

  for (const score of sortedScores) {
    if (score.finalRank === 1) {
      if (currentStreak === tempStreak) currentStreak++;
      tempStreak++;
      bestStreak = Math.max(bestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.profile?.displayName ?? user.email.split('@')[0],
    avatarUrl: user.profile?.avatarUrl ?? null,
    totalPoints,
    bestWeek,
    pickPercentage,
    currentStreak,
    bestStreak,
    weeklyScores: user.weeklyScores,
    picks: user.picks,
    cumulativeData,
  };
}
