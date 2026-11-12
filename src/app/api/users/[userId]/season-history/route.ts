import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { canViewPick } from '@/lib/pick-privacy';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { userId } = await params;

    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return NextResponse.json({ weeks: [] });

    const weeks = await prisma.week.findMany({
      where: { seasonId: season.id },
      include: {
        games: { orderBy: { startTime: 'asc' } },
        weeklyScores: { where: { userId } },
        picks: { where: { userId } },
      },
      orderBy: { weekNumber: 'desc' },
    });

    const result = weeks.map((week) => {
      const score = week.weeklyScores[0] ?? null;
      return {
        weekId: week.id,
        weekNumber: week.weekNumber,
        lockTime: week.lockTime,
        isFinal: week.isFinal,
        recapVisible: week.recapVisible,
        score: score
          ? {
              points: score.points,
              finalRank: score.finalRank,
              tiebreakerUsed: score.tiebreakerUsed,
            }
          : null,
        games: week.games.map((game) => {
          const pick = week.picks.find((p) => p.gameId === game.id) ?? null;
          return {
            gameId: game.id,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            winnerTeam: game.winnerTeam,
            isFinal: game.isFinal,
            startTime: game.startTime,
            pick: pick && canViewPick({ ownerId: userId, viewerId: session.user.id, startTime: game.startTime })
              ? {
                  pickedTeam: pick.pickedTeam,
                  isCorrect: pick.isCorrect,
                  pointsEarned: pick.pointsEarned,
                  isAutoPick: pick.isAutoPick,
                }
              : null,
          };
        }),
      };
    });

    return NextResponse.json({ weeks: result });
  } catch (error) {
    console.error('[season-history] error:', error);
    return NextResponse.json({ error: 'Failed to fetch season history' }, { status: 500 });
  }
}
