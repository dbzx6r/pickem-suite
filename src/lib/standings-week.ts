type ScheduledWeek = { weekNumber: number; games: { startTime: Date; isFinal: boolean; statusState: string | null }[] };

/** The next pick window must not replace results before its first kickoff. */
export function standingsWeek(weeks: ScheduledWeek[], now: Date): number | null {
  const started = weeks.filter(w => w.games.some(g => g.isFinal || g.statusState === 'in' || g.startTime <= now));
  return started.length ? Math.max(...started.map(w => w.weekNumber)) : null;
}
