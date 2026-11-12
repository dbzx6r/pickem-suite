'use client';

import useSWR from 'swr';
import { GameCardData } from '@/components/GameCard';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useLiveGames(weekNumber?: number, fastRefresh = false) {
  const url = weekNumber
    ? `/api/games/live?week=${weekNumber}`
    : '/api/games/live';

  const { data, error, isLoading, mutate } = useSWR<{ games: GameCardData[] }>(
    url,
    fetcher,
    {
      refreshInterval: (data) => {
        const hasLiveGames = data?.games?.some((g) => g.statusState === 'in');
        return fastRefresh || hasLiveGames ? 15_000 : 5 * 60_000;
      },
      revalidateOnFocus: true,
    }
  );

  return {
    games: data?.games ?? [],
    isLoading,
    error,
    refresh: mutate,
  };
}
