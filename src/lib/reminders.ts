export const REQUIRED_ONE_HOUR_LEAD_MINUTES = 60;

export function currentReminderWeek<T extends { weekNumber: number; isFinal: boolean }>(weeks: T[]): T | null {
  return [...weeks]
    .filter((week) => !week.isFinal)
    .sort((a, b) => a.weekNumber - b.weekNumber)[0] ?? null;
}

export function parseReminderMinutes(value: string | null | undefined, fallbackHours: number): number[] {
  const parsed = (value ?? '').split(',').map(Number).filter((candidate) => Number.isInteger(candidate) && candidate >= 5 && candidate <= 10080);
  const configured = parsed.length ? parsed : [fallbackHours * 60, 15];
  return [...new Set([...configured, REQUIRED_ONE_HOUR_LEAD_MINUTES])].sort((a, b) => b - a);
}

export function dueReminderLead(startTime: Date, now: Date, leads: number[], cadenceMinutes = 10): number | null {
  const minutesUntil = (startTime.getTime() - now.getTime()) / 60_000;
  return leads.find((lead) => minutesUntil <= lead && minutesUntil > lead - cadenceMinutes) ?? null;
}

export function missingEntryItemsForGame(input: {
  gameId: string;
  tiebreakerGameId: string | null;
  hasPick: boolean;
  hasTiebreaker: boolean;
}) {
  return {
    missingPick: !input.hasPick,
    missingTiebreaker: input.gameId === input.tiebreakerGameId && !input.hasTiebreaker,
  };
}

export function gameLockReminderCopy(input: {
  awayTeam: string;
  homeTeam: string;
  weekNumber: number;
  lead: number;
  missingPick: boolean;
  missingTiebreaker: boolean;
}) {
  const when = input.lead >= 60
    ? `in about ${Math.round(input.lead / 60)} hour${input.lead >= 120 ? 's' : ''}`
    : `in ${input.lead} minutes`;
  const matchup = `${input.awayTeam} at ${input.homeTeam}`;

  if (input.missingPick && input.missingTiebreaker) {
    return {
      title: 'Pick and tiebreaker still missing',
      message: `${matchup} begins ${when}. Your pick and Week ${input.weekNumber} tiebreaker are still missing.`,
    };
  }
  if (input.missingTiebreaker) {
    return {
      title: 'Your tiebreaker is still open',
      message: `The Week ${input.weekNumber} tiebreaker locks when ${matchup} begins ${when}.`,
    };
  }
  return {
    title: input.lead >= 60 ? 'Your NFL pick is still open' : 'Game locks soon',
    message: `${matchup} locks ${when}.`,
  };
}
