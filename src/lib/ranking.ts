import crypto from 'crypto';

export type RankingInput = {
  userId: string;
  effectivePoints: number;
  tbDiff: number | null;
};

export type RankedEntry<T extends RankingInput> = T & {
  finalRank: number;
  tiebreakerUsed: boolean;
  randomTiebroken: boolean;
};

function stableTieValue(weekId: string, groupIds: string[], userId: string) {
  return crypto.createHash('sha256').update(`${weekId}|${groupIds.join(',')}|${userId}`).digest('hex');
}

export function rankWeeklyEntries<T extends RankingInput>(weekId: string, input: T[]): Array<RankedEntry<T>> {
  const pointGroups = new Map<number, T[]>();
  for (const entry of input) pointGroups.set(entry.effectivePoints, [...(pointGroups.get(entry.effectivePoints) ?? []), entry]);
  const ranked: Array<{ entry: T; tiebreakerUsed: boolean; randomTiebroken: boolean }> = [];

  for (const points of [...pointGroups.keys()].sort((a, b) => b - a)) {
    const pointGroup = pointGroups.get(points)!;
    const tiebreakerUsed = pointGroup.length > 1;
    const tiebreakerGroups = new Map<number, T[]>();
    for (const entry of pointGroup) {
      const key = entry.tbDiff ?? Number.POSITIVE_INFINITY;
      tiebreakerGroups.set(key, [...(tiebreakerGroups.get(key) ?? []), entry]);
    }
    for (const key of [...tiebreakerGroups.keys()].sort((a, b) => a - b)) {
      const tied = tiebreakerGroups.get(key)!;
      const randomTiebroken = tied.length > 1;
      const groupIds = tied.map((entry) => entry.userId).sort();
      tied.sort((a, b) => stableTieValue(weekId, groupIds, a.userId).localeCompare(stableTieValue(weekId, groupIds, b.userId)));
      ranked.push(...tied.map((entry) => ({ entry, tiebreakerUsed, randomTiebroken })));
    }
  }
  return ranked.map((item, index) => ({ ...item.entry, tiebreakerUsed: item.tiebreakerUsed, randomTiebroken: item.randomTiebroken, finalRank: index + 1 }));
}
