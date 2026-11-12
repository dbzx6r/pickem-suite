'use client';

import useSWR from 'swr';
import type { LeaderboardEntry } from '@/components/LeaderboardTable';
import type { WeeklyWinner } from '@/lib/weekly-winner';

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to refresh leaderboard');
  return response.json();
};

export function useLeaderboard() {
  const { data, error, isLoading, mutate } = useSWR<{
    entries: LeaderboardEntry[];
    weeklyWinner: WeeklyWinner | null;
    currentWeekId?: string;
    weeklyScoresMap: Record<string, { points: number; rank: number | null }>;
  }>('/api/leaderboard', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });

  return {
    currentWeekId: data?.currentWeekId,
    entries: data?.entries ?? [],
    weeklyWinner: data?.weeklyWinner ?? null,
    weeklyScoresMap: data?.weeklyScoresMap ?? {},
    isLoading,
    error,
    refresh: mutate,
  };
}
