import { PrismaClient } from '@prisma/client';

export const ACHIEVEMENTS = [
  { id: 'perfect_slate',   name: 'Perfect Slate',    icon: '🎯',    description: 'Got every pick correct in a single slate' },
  { id: 'century_club',    name: 'Century Club',     icon: '💯',    description: 'Submitted 100 total picks' },
  { id: 'streak_5',        name: 'On a Roll',        icon: '🔥',    description: 'Participated in 5 consecutive slates' },
  { id: 'streak_10',       name: 'Consistent',       icon: '🔥🔥',  description: 'Participated in 10 consecutive slates' },
  { id: 'first_place',     name: 'Topped the Board', icon: '🥇',    description: 'Finished #1 on a slate' },
  { id: 'underdog_5',      name: 'Underdog Lover',   icon: '🎲',    description: 'Correctly picked 5 underdogs' },
  { id: 'early_bird_10',   name: 'Chronically Early',icon: '🌅',    description: 'Submitted picks 24h+ before lock on 10 slates' },
  { id: 'hot_hand',        name: 'Hot Hand',         icon: '🤌',    description: '10 correct picks in a row' },
] as const;

export type AchievementId = typeof ACHIEVEMENTS[number]['id'];

/** Returns the abbreviation of the favored team, or null if unparseable. */
function parseFavoriteTeam(spreadLine: string): string | null {
  // "TEAM -X.X" format — team listed before the negative spread is the favorite
  const m1 = spreadLine.match(/^([A-Za-z0-9]+)\s+-[\d.]+/);
  if (m1) return m1[1].toUpperCase();
  // "-X.X TEAM" format — team listed after the negative spread is the favorite
  const m2 = spreadLine.match(/-[\d.]+\s+([A-Za-z0-9]+)/);
  if (m2) return m2[1].toUpperCase();
  return null;
}

export async function seedAchievements(prisma: PrismaClient): Promise<void> {
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { id: a.id },
      update: { name: a.name, description: a.description, icon: a.icon },
      create: { id: a.id, name: a.name, description: a.description, icon: a.icon },
    });
  }
}

export async function checkAndAwardAchievements(
  userId: string,
  prisma: PrismaClient,
  weekId?: string,
): Promise<void> {
  if (weekId) {
    const week = await prisma.week.findUnique({
      where: { id: weekId },
      select: { season: { select: { seasonType: true } } },
    });
    if (week?.season.seasonType !== 'REGULAR') return;
  }

  const earned = await prisma.userAchievement.findMany({ where: { userId } });
  const earnedIds = new Set(earned.map((e) => e.achievementId));

  async function award(achievementId: AchievementId, ctx?: string): Promise<void> {
    if (earnedIds.has(achievementId)) return;
    // slateId field on UserAchievement stores the weekId in the NFL app
    await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      update: {},
      create: { userId, achievementId, slateId: ctx ?? weekId ?? null },
    });
    earnedIds.add(achievementId);
  }

  // ── perfect_slate ─────────────────────────────────────────────────────────
  if (!earnedIds.has('perfect_slate')) {
    const finalWeeks = await prisma.week.findMany({
      where: { isFinal: true, picks: { some: { userId } } },
      select: { id: true },
    });
    for (const w of finalWeeks) {
      const picks = await prisma.pick.findMany({
        where: { userId, weekId: w.id },
        select: { isCorrect: true },
      });
      if (picks.length > 0 && picks.every((p) => p.isCorrect === true)) {
        await award('perfect_slate', w.id);
        break;
      }
    }
  }

  // ── century_club ──────────────────────────────────────────────────────────
  if (!earnedIds.has('century_club')) {
    const count = await prisma.pick.count({ where: { userId } });
    if (count >= 100) await award('century_club');
  }

  // ── streak_5 / streak_10 ──────────────────────────────────────────────────
  if (!earnedIds.has('streak_5') || !earnedIds.has('streak_10')) {
    // Get all weeks that have any picks (i.e., are active/past), ordered chronologically
    const allWeeks = await prisma.week.findMany({
      where: { picks: { some: {} } },
      orderBy: { lockTime: 'asc' },
      select: { id: true },
    });
    const userWeekIds = new Set(
      (
        await prisma.pick.findMany({
          where: { userId },
          select: { weekId: true },
          distinct: ['weekId'],
        })
      ).map((p) => p.weekId),
    );
    let maxRun = 0;
    let run = 0;
    for (const w of allWeeks) {
      if (userWeekIds.has(w.id)) {
        run++;
        if (run > maxRun) maxRun = run;
      } else {
        run = 0;
      }
    }
    if (maxRun >= 5 && !earnedIds.has('streak_5')) await award('streak_5');
    if (maxRun >= 10 && !earnedIds.has('streak_10')) await award('streak_10');
  }

  // ── first_place ───────────────────────────────────────────────────────────
  if (!earnedIds.has('first_place')) {
    const topScore = await prisma.weeklyScore.findFirst({
      where: { userId, finalRank: 1 },
    });
    if (topScore) await award('first_place', topScore.weekId);
  }

  // ── underdog_5 ────────────────────────────────────────────────────────────
  if (!earnedIds.has('underdog_5')) {
    const correctPicks = await prisma.pick.findMany({
      where: { userId, isCorrect: true },
      select: {
        pickedTeam: true,
        game: { select: { spreadLine: true, homeTeam: true, awayTeam: true } },
      },
    });
    let underdogCount = 0;
    for (const pick of correctPicks) {
      const { spreadLine, homeTeam, awayTeam } = pick.game;
      if (!spreadLine) continue;
      const favorite = parseFavoriteTeam(spreadLine);
      if (!favorite) continue;
      const underdog = favorite === homeTeam.toUpperCase() ? awayTeam : homeTeam;
      if (pick.pickedTeam === underdog) underdogCount++;
    }
    if (underdogCount >= 5) await award('underdog_5');
  }

  // ── early_bird_10 ─────────────────────────────────────────────────────────
  if (!earnedIds.has('early_bird_10')) {
    const picks = await prisma.pick.findMany({
      where: { userId },
      select: {
        weekId: true,
        createdAt: true,
        week: { select: { lockTime: true } },
      },
    });
    const earlyWeeks = new Set<string>();
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    for (const pick of picks) {
      if (pick.createdAt.getTime() < pick.week.lockTime.getTime() - TWENTY_FOUR_HOURS_MS) {
        earlyWeeks.add(pick.weekId);
      }
    }
    if (earlyWeeks.size >= 10) await award('early_bird_10');
  }

  // ── hot_hand ──────────────────────────────────────────────────────────────
  if (!earnedIds.has('hot_hand')) {
    const allPicks = await prisma.pick.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { isCorrect: true },
    });
    let maxRun = 0;
    let run = 0;
    for (const p of allPicks) {
      if (p.isCorrect === true) {
        run++;
        if (run > maxRun) maxRun = run;
      } else {
        run = 0;
      }
    }
    if (maxRun >= 10) await award('hot_hand');
  }
}
