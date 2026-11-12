import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function parseFavoredTeam(spreadLine: string | null | undefined): string | null {
  if (!spreadLine) return null;
  const t = spreadLine.trim();
  // "TEAM -X.X" → team is the favorite
  const m1 = t.match(/^([A-Z0-9]+)\s+(-\d+\.?\d*)/);
  if (m1) return m1[1];
  // "-X.X TEAM" → team is the favorite
  const m2 = t.match(/^-\d+\.?\d*\s+([A-Z0-9]+)/);
  if (m2) return m2[1];
  return null;
}

function timeOfDayLabel(avgHour: number): string {
  if (avgHour >= 6 && avgHour < 12) return 'Morning Picker';
  if (avgHour >= 12 && avgHour < 18) return 'Afternoon Picker';
  if (avgHour >= 18 && avgHour < 22) return 'Evening Picker';
  return 'Night Owl';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { userId } = await params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true, isSandbox: false },
    });
    const activeSeasonId = activeSeason?.id ?? '__no_active_season__';
    const viewingOwnStats = session.user.id === userId;

    // Opponents' behavioral stats must not reveal or allow inference from future picks.
    const userPicks = await prisma.pick.findMany({
      where: {
        userId,
        week: { seasonId: activeSeasonId },
        ...(viewingOwnStats ? {} : { game: { startTime: { lte: new Date() } } }),
      },
      include: { game: true, week: true },
      orderBy: { createdAt: 'asc' },
    });

    // ── 1. pickTiming ──────────────────────────────────────────────────────────
    const hourDistribution: Record<string, number> = {};
    for (let h = 0; h < 24; h++) hourDistribution[String(h)] = 0;

    const minutesArray: number[] = [];
    userPicks.forEach((p) => {
      const lockTime = p.week.lockTime; // NFL lock = week lockTime
      minutesArray.push((lockTime.getTime() - p.createdAt.getTime()) / 60000);
      hourDistribution[String(p.createdAt.getUTCHours())]++;
    });

    const avgMinutesBeforeLock =
      minutesArray.length > 0
        ? minutesArray.reduce((s, v) => s + v, 0) / minutesArray.length
        : 0;
    const earliestMinutesBeforeLock =
      minutesArray.length > 0 ? Math.max(...minutesArray) : 0;
    const latestMinutesBeforeLock =
      minutesArray.length > 0 ? Math.min(...minutesArray) : 0;

    const avgHour =
      userPicks.length > 0
        ? userPicks.reduce((s, p) => s + p.createdAt.getUTCHours(), 0) / userPicks.length
        : 12;

    const pickTiming = {
      avgMinutesBeforeLock,
      earliestMinutesBeforeLock,
      latestMinutesBeforeLock,
      timeOfDayLabel: timeOfDayLabel(avgHour),
      hourDistribution,
    };

    // ── 2. pickLoyalty ─────────────────────────────────────────────────────────
    const teamCounts: Record<string, number> = {};
    userPicks.forEach((p) => {
      teamCounts[p.pickedTeam] = (teamCounts[p.pickedTeam] || 0) + 1;
    });

    const sortedTeams = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]);
    const mostPickedTeam =
      sortedTeams.length > 0
        ? { team: sortedTeams[0][0], count: sortedTeams[0][1] }
        : null;
    const leastPickedTeam =
      sortedTeams.length > 0
        ? {
            team: sortedTeams[sortedTeams.length - 1][0],
            count: sortedTeams[sortedTeams.length - 1][1],
          }
        : null;

    let longestSameTeamStreak = 0;
    let curTeamStreak = 0;
    let prevTeam = '';
    userPicks.forEach((p) => {
      if (p.pickedTeam === prevTeam) {
        curTeamStreak++;
      } else {
        prevTeam = p.pickedTeam;
        curTeamStreak = 1;
      }
      if (curTeamStreak > longestSameTeamStreak) longestSameTeamStreak = curTeamStreak;
    });

    const pickLoyalty = { mostPickedTeam, leastPickedTeam, longestSameTeamStreak };

    // ── 3. herdMentality ───────────────────────────────────────────────────────
    const gameIds = userPicks.map((p) => p.gameId);
    let majorityAgreementPct = 0;
    let pickTwinResult: { userId: string; displayName: string; agreementPct: number } | null =
      null;
    let nemesisResult: { userId: string; displayName: string; agreementPct: number } | null =
      null;

    if (gameIds.length > 0) {
      const allPicksForGames = await prisma.pick.findMany({
        where: { gameId: { in: gameIds } },
        include: { user: { include: { profile: true } } },
      });

      // Majority pick per game across all users
      const gamePickCounts: Record<string, Record<string, number>> = {};
      allPicksForGames.forEach((p) => {
        if (!gamePickCounts[p.gameId]) gamePickCounts[p.gameId] = {};
        gamePickCounts[p.gameId][p.pickedTeam] =
          (gamePickCounts[p.gameId][p.pickedTeam] || 0) + 1;
      });

      const majorityPickPerGame: Record<string, string> = {};
      Object.entries(gamePickCounts).forEach(([gid, counts]) => {
        majorityPickPerGame[gid] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      });

      const thisUserPickMap: Record<string, string> = {};
      userPicks.forEach((p) => {
        thisUserPickMap[p.gameId] = p.pickedTeam;
      });

      const majorityAgreements = userPicks.filter(
        (p) => majorityPickPerGame[p.gameId] === p.pickedTeam,
      ).length;
      majorityAgreementPct =
        userPicks.length > 0 ? (majorityAgreements / userPicks.length) * 100 : 0;

      // Build per-user pick maps and display names
      const userPickMap: Record<string, Record<string, string>> = {};
      const userDisplayNames: Record<string, string> = {};
      allPicksForGames.forEach((p) => {
        if (!userPickMap[p.userId]) userPickMap[p.userId] = {};
        userPickMap[p.userId][p.gameId] = p.pickedTeam;
        userDisplayNames[p.userId] = p.user.profile?.displayName ?? p.userId;
      });

      let pickTwinPct = -1;
      let nemesisPct = 101;

      Object.entries(userPickMap).forEach(([uid, theirPicks]) => {
        if (uid === userId) return;
        const commonGames = Object.keys(thisUserPickMap).filter(
          (gid) => theirPicks[gid] !== undefined,
        );
        if (commonGames.length < 5) return;
        const agreements = commonGames.filter(
          (gid) => thisUserPickMap[gid] === theirPicks[gid],
        ).length;
        const pct = (agreements / commonGames.length) * 100;
        if (pct > pickTwinPct) {
          pickTwinPct = pct;
          pickTwinResult = {
            userId: uid,
            displayName: userDisplayNames[uid] ?? uid,
            agreementPct: pct,
          };
        }
        if (pct < nemesisPct) {
          nemesisPct = pct;
          nemesisResult = {
            userId: uid,
            displayName: userDisplayNames[uid] ?? uid,
            agreementPct: pct,
          };
        }
      });
    }

    const herdMentality = {
      majorityAgreementPct,
      pickTwin: pickTwinResult,
      nemesis: nemesisResult,
    };

    // ── 4. luckIndex ───────────────────────────────────────────────────────────
    let favWins = 0,
      favLosses = 0,
      underdogWins = 0,
      underdogLosses = 0,
      manualWins = 0,
      manualLosses = 0;

    userPicks.forEach((p) => {
      if (p.isCorrect === null || p.isCorrect === undefined) return;
      const correct = p.isCorrect;

      if (correct) manualWins++;
      else manualLosses++;

      const favoredTeam = parseFavoredTeam(p.game.spreadLine);
      if (!favoredTeam) return;

      if (p.pickedTeam === favoredTeam) {
        if (correct) favWins++;
        else favLosses++;
      } else {
        if (correct) underdogWins++;
        else underdogLosses++;
      }
    });

    const winPct = (w: number, l: number) => (w + l > 0 ? (w / (w + l)) * 100 : 0);
    const luckIndex = {
      favoriteRecord: { wins: favWins, losses: favLosses, pct: winPct(favWins, favLosses) },
      underdogRecord: {
        wins: underdogWins,
        losses: underdogLosses,
        pct: winPct(underdogWins, underdogLosses),
      },
      manualPickRecord: {
        wins: manualWins,
        losses: manualLosses,
        pct: winPct(manualWins, manualLosses),
      },
    };

    // ── 5. engagement ──────────────────────────────────────────────────────────
    const totalPicks = userPicks.length;
    const weeksPlayedSet = new Set(userPicks.map((p) => p.weekId));
    const slatesPlayed = weeksPlayedSet.size;

    // Order by lockTime for chronological consecutive-streak logic
    const allWeeks = await prisma.week.findMany({
      where: { seasonId: activeSeasonId },
      orderBy: { lockTime: 'asc' },
    });
    const totalSlates = allWeeks.length;
    const participationRate = totalSlates > 0 ? (slatesPlayed / totalSlates) * 100 : 0;

    let longestConsecutiveStreak = 0;
    let runStreak = 0;
    allWeeks.forEach((w) => {
      if (weeksPlayedSet.has(w.id)) {
        runStreak++;
        if (runStreak > longestConsecutiveStreak) longestConsecutiveStreak = runStreak;
      } else {
        runStreak = 0;
      }
    });

    let currentConsecutiveStreak = 0;
    for (let i = allWeeks.length - 1; i >= 0; i--) {
      if (weeksPlayedSet.has(allWeeks[i].id)) {
        currentConsecutiveStreak++;
      } else {
        break;
      }
    }

    const engagement = {
      totalPicks,
      slatesPlayed,
      totalSlates,
      participationRate,
      currentConsecutiveStreak,
      longestConsecutiveStreak,
    };

    // ── 6. personalityBadges ───────────────────────────────────────────────────
    const badges: Array<{ id: string; label: string; desc: string }> = [];

    if (totalPicks > 0 && avgMinutesBeforeLock > 1440)
      badges.push({ id: 'early_bird', label: '🌅 Early Bird', desc: 'Picks well ahead of lock' });

    if (totalPicks > 0 && avgMinutesBeforeLock < 60)
      badges.push({ id: 'procrastinator', label: '⏰ Procrastinator', desc: 'Lives on the edge' });

    if (totalPicks > 0 && majorityAgreementPct < 40)
      badges.push({ id: 'contrarian', label: '🏴‍☠️ Contrarian', desc: 'Bucks the trend' });

    if (mostPickedTeam && totalPicks > 0 && mostPickedTeam.count / totalPicks > 0.3)
      badges.push({
        id: 'loyalist',
        label: '💛 Loyalist',
        desc: 'Rides or dies with their team',
      });

    const underdogPickTotal = underdogWins + underdogLosses;
    const favoritePickTotal = favWins + favLosses;
    if (underdogPickTotal > 0 && underdogPickTotal > favoritePickTotal)
      badges.push({ id: 'gambler', label: '🎲 Gambler', desc: 'Loves an underdog' });

    // ── 7. pickChangeHabit ─────────────────────────────────────────────────────
    let totalEdits = 0;
    let mostEditedSlateId: string | null = null;
    let mostEditedSlateEdits = 0;

    try {
      const editsByWeek: Record<string, number> = {};
      userPicks.forEach((p) => {
        const edits = p.editCount ?? 0;
        totalEdits += edits;
        editsByWeek[p.weekId] = (editsByWeek[p.weekId] || 0) + edits;
      });
      Object.entries(editsByWeek).forEach(([wid, edits]) => {
        if (edits > mostEditedSlateEdits) {
          mostEditedSlateEdits = edits;
          mostEditedSlateId = wid;
        }
      });
    } catch {
      totalEdits = 0;
      mostEditedSlateId = null;
      mostEditedSlateEdits = 0;
    }

    const pickChangeHabit = {
      totalEdits,
      avgEditsPerSlate: slatesPlayed > 0 ? totalEdits / slatesPlayed : 0,
      mostEditedSlateId,
      mostEditedSlateEdits,
    };

    return NextResponse.json({
      pickTiming,
      pickLoyalty,
      herdMentality,
      luckIndex,
      engagement,
      personalityBadges: badges,
      pickChangeHabit,
    });
  } catch (error) {
    console.error('[fun-stats] error:', error);
    return NextResponse.json({ error: 'Failed to compute fun stats' }, { status: 500 });
  }
}
