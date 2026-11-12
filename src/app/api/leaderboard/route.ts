import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/scoring';
import { isSandboxModeFromCookieHeader } from '@/lib/sandboxContext';
import { getActiveWeek } from '@/lib/getActiveContext';
import { auth } from '@/lib/auth';
import { getLatestWeeklyWinner } from '@/lib/getWeeklyWinner';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const isSandbox = isSandboxModeFromCookieHeader(request.headers.get('cookie'));
    const entries = await getLeaderboard(isSandbox);

    // Use the earliest unfinished week, not the highest preloaded future week.
    const currentWeek = await getActiveWeek(isSandbox);
    const weeklyScoresMap: Record<string, { points: number; rank: number | null }> = {};
    if (currentWeek) {
      for (const ws of currentWeek.weeklyScores) {
        weeklyScoresMap[ws.userId] = { points: ws.points, rank: ws.finalRank };
      }
    }

    const weeklyWinner = await getLatestWeeklyWinner(isSandbox);
    return NextResponse.json({ entries, weeklyScoresMap, weeklyWinner, currentWeekId: currentWeek?.id });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
