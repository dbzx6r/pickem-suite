export class ScheduleValidationError extends Error {}

/** NFL season dates can extend into the next calendar year's postseason. */
export function assertSeasonKickoff(value: Date | string, seasonYear: number) {
  const time = new Date(value).getTime();
  const first = Date.UTC(seasonYear, 2, 1);
  const last = Date.UTC(seasonYear + 1, 2, 1);
  if (!Number.isInteger(seasonYear) || !Number.isFinite(time) || time < first || time >= last) {
    throw new ScheduleValidationError(`Rejected sports schedule: kickoff outside NFL season ${seasonYear}`);
  }
}

export function assertScoreboardSchedule(data: { season?: { year?: number; type?: number }; week?: { number?: number }; events?: Array<{ competitions?: Array<{ date?: string }> }> }, year: number, week: number, seasonType: number) {
  if (data.season?.year !== year || data.season?.type !== seasonType || data.week?.number !== week || !Array.isArray(data.events)) {
    throw new ScheduleValidationError('Rejected sports schedule: response does not match the requested season/week');
  }
  for (const event of data.events) {
    const kickoff = event.competitions?.[0]?.date;
    if (!kickoff) throw new ScheduleValidationError('Rejected sports schedule: missing kickoff');
    assertSeasonKickoff(kickoff, year);
  }
}
