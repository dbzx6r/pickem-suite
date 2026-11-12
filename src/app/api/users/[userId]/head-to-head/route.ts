import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { userId } = await params;
    const { searchParams } = new URL(request.url);
    const opponentId = searchParams.get('opponentId') ?? undefined;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true, isSandbox: false },
    });

    const userScores = await prisma.weeklyScore.findMany({
      where: {
        userId,
        week: { seasonId: activeSeason?.id ?? '__no_active_season__' },
      },
      include: { week: true },
    });

    if (userScores.length === 0) {
      const empty = { overall: { wins: 0, losses: 0, ties: 0, totalSlates: 0 } };
      if (opponentId) {
        return NextResponse.json({
          ...empty,
          opponent: {
            userId: opponentId,
            displayName: opponentId,
            avatarUrl: null,
            wins: 0,
            losses: 0,
            ties: 0,
            slates: [],
          },
        });
      }
      return NextResponse.json({ ...empty, allOpponents: [] });
    }

    const weekIds = userScores.map((s) => s.weekId);
    const allScoresOnSharedWeeks = await prisma.weeklyScore.findMany({
      where: { weekId: { in: weekIds }, userId: { not: userId } },
      include: { user: { include: { profile: true } }, week: true },
    });

    // weekId -> userId's points
    const userScoreMap: Record<string, number> = {};
    userScores.forEach((s) => {
      userScoreMap[s.weekId] = s.adminOverridePoints ?? s.points;
    });

    if (opponentId) {
      const opponent = await prisma.user.findUnique({
        where: { id: opponentId },
        include: { profile: true },
      });

      const opponentScores = allScoresOnSharedWeeks.filter((s) => s.userId === opponentId);

      let wins = 0,
        losses = 0,
        ties = 0;
      const slates: Array<{
        weekId: string;
        weekNumber: number;
        userPoints: number;
        opponentPoints: number;
        result: 'win' | 'loss' | 'tie';
      }> = [];

      opponentScores.forEach((opScore) => {
        const userPoints = userScoreMap[opScore.weekId] ?? 0;
        const opPoints = opScore.adminOverridePoints ?? opScore.points;
        let result: 'win' | 'loss' | 'tie';
        if (userPoints > opPoints) {
          wins++;
          result = 'win';
        } else if (userPoints < opPoints) {
          losses++;
          result = 'loss';
        } else {
          ties++;
          result = 'tie';
        }
        slates.push({
          weekId: opScore.weekId,
          weekNumber: opScore.week.weekNumber,
          userPoints,
          opponentPoints: opPoints,
          result,
        });
      });

      slates.sort((a, b) => a.weekNumber - b.weekNumber);
      let currentStreak = 0;
      let currentStreakResult: 'win' | 'loss' | 'tie' | null = null;
      for (const slate of [...slates].reverse()) {
        if (!currentStreakResult) currentStreakResult = slate.result;
        if (slate.result !== currentStreakResult) break;
        currentStreak += 1;
      }
      const pointMargin = slates.reduce((sum, slate) => sum + slate.userPoints - slate.opponentPoints, 0);
      const isRivalry = slates.length >= 3 && Math.abs(wins - losses) <= Math.max(2, Math.floor(slates.length / 3));

      return NextResponse.json({
        overall: { wins, losses, ties, totalSlates: slates.length },
        opponent: {
          userId: opponentId,
          displayName: opponent?.profile?.displayName ?? opponentId,
          avatarUrl: opponent?.profile?.avatarUrl ?? null,
          wins,
          losses,
          ties,
          slates,
          pointMargin,
          isRivalry,
          currentStreak: { result: currentStreakResult, count: currentStreak },
        },
      });
    }

    // Aggregate W/L/T vs every opponent across all shared weeks
    const opponentMap: Record<
      string,
      {
        userId: string;
        displayName: string;
        avatarUrl: string | null;
        wins: number;
        losses: number;
        ties: number;
        totalGames: number;
        rivalryScore: number;
        isRivalry: boolean;
      }
    > = {};

    allScoresOnSharedWeeks.forEach((opScore) => {
      const uid = opScore.userId;
      if (!opponentMap[uid]) {
        opponentMap[uid] = {
          userId: uid,
          displayName: opScore.user.profile?.displayName ?? uid,
          avatarUrl: opScore.user.profile?.avatarUrl ?? null,
          wins: 0,
          losses: 0,
          ties: 0,
          totalGames: 0,
          rivalryScore: 0,
          isRivalry: false,
        };
      }
      const userPoints = userScoreMap[opScore.weekId] ?? 0;
      const opPoints = opScore.adminOverridePoints ?? opScore.points;
      opponentMap[uid].totalGames++;
      if (userPoints > opPoints) opponentMap[uid].wins++;
      else if (userPoints < opPoints) opponentMap[uid].losses++;
      else opponentMap[uid].ties++;
    });

    let totalWins = 0,
      totalLosses = 0,
      totalTies = 0;
    const allOpponents = Object.values(opponentMap).map((opponent) => ({
      ...opponent,
      rivalryScore: opponent.totalGames * 10 - Math.abs(opponent.wins - opponent.losses) * 3,
      isRivalry: opponent.totalGames >= 3 && Math.abs(opponent.wins - opponent.losses) <= Math.max(2, Math.floor(opponent.totalGames / 3)),
    })).sort((a, b) => b.rivalryScore - a.rivalryScore);
    allOpponents.forEach((o) => {
      totalWins += o.wins;
      totalLosses += o.losses;
      totalTies += o.ties;
    });

    return NextResponse.json({
      overall: {
        wins: totalWins,
        losses: totalLosses,
        ties: totalTies,
        totalSlates: userScores.length,
      },
      allOpponents,
    });
  } catch (error) {
    console.error('[head-to-head] error:', error);
    return NextResponse.json({ error: 'Failed to compute head-to-head stats' }, { status: 500 });
  }
}
