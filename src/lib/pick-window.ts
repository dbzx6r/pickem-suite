export const OPEN_WEEK_LIMIT = 2;

export type PickWindowWeek = {
  id: string;
  lockTime: Date;
  isFinal: boolean;
  games?: Array<{ startTime: Date }>;
};

function pickWindowCloseTime(week: PickWindowWeek): number {
  if (!week.games?.length) return week.lockTime.getTime();
  return Math.max(...week.games.map((game) => game.startTime.getTime()));
}

/**
 * Return the next weeks that are eligible for picks.
 *
 * A partially started week remains in the window while it still has an
 * unstarted game. Each game is locked separately by the picks API, so the next
 * queued week enters the two-week window after the prior week's last kickoff.
 */
export function getOpenWeekIds(
  weeks: PickWindowWeek[],
  now: Date = new Date(),
  limit: number = OPEN_WEEK_LIMIT,
): Set<string> {
  return new Set(
    weeks
      .filter((week) => !week.isFinal && pickWindowCloseTime(week) > now.getTime())
      .sort((a, b) => a.lockTime.getTime() - b.lockTime.getTime())
      .slice(0, limit)
      .map((week) => week.id),
  );
}

export function isWeekOpenForPicks(
  weekId: string,
  weeks: PickWindowWeek[],
  now: Date = new Date(),
  limit: number = OPEN_WEEK_LIMIT,
): boolean {
  return getOpenWeekIds(weeks, now, limit).has(weekId);
}

export function isGameOpenForPicks(startTime: Date, now: Date = new Date()): boolean {
  return startTime.getTime() > now.getTime();
}

export function isTiebreakerOpenForSubmission(startTime: Date, now: Date = new Date()): boolean {
  return isGameOpenForPicks(startTime, now);
}
