export type TiebreakerCandidate = {
  id: string; startTime: Date; isFinal: boolean; statusState: string | null;
};

// The last scheduled kickoff, not the game whose final whistle happens last.
// Keep an existing choice on equal kickoffs; otherwise use stable ID ordering.
export function lastTiebreakerGame<T extends TiebreakerCandidate>(
  games: T[], currentId: string | null, weekFinal: boolean, now = new Date(),
): T | null {
  const current = games.find(g => g.id === currentId) ?? null;
  const started = (g: T) => g.isFinal || g.startTime <= now || ['in', 'post', 'suspended'].includes(g.statusState ?? '');
  if (weekFinal || (current && started(current))) return current;
  const sorted = games.filter(g => Number.isFinite(g.startTime.getTime()) && g.statusState === 'pre' && !g.isFinal)
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime() ||
      Number(b.id === currentId) - Number(a.id === currentId) || a.id.localeCompare(b.id));
  const selected = sorted[0];
  // Never replace a live/final tiebreaker or create a new one already in progress.
  return selected && !started(selected) ? selected : current;
}
