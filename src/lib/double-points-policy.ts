// Pacific civil time, including daylight-saving changes. Never use server TZ.
export const DOUBLE_POINTS_POLICY_START = new Date('2026-10-06T16:00:00Z');
const zone = 'America/Los_Angeles';
function localParts(date: Date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map(p => [p.type, p.value]));
}

export function doublePointsDeadline(firstKickoff: Date): Date {
  const p = localParts(firstKickoff);
  const day = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 5) % 7);
  // Resolve Tuesday 09:00 Pacific from its civil components (two passes for DST).
  const civil = day.getTime() + 9 * 3600_000;
  let utc = civil;
  for (let i = 0; i < 2; i++) {
    const v = localParts(new Date(utc));
    const rendered = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
    utc += civil - rendered;
  }
  if (utc >= firstKickoff.getTime()) return doublePointsDeadline(new Date(firstKickoff.getTime() - 86400_000));
  return new Date(utc);
}

export function absoluteSpread(line: string | null): number | null {
  if (!line) return null;
  const value = line.trim().replace(/\u2212/g, '-');
  if (/^(?:PK|PICK(?:\s*'?EM)?|EVEN)$/i.test(value)) return 0;
  // Reject totals, moneylines and ambiguous text. ESPN details: "BUF -2.5".
  const match = value.match(/^(?:[A-Z]{2,4}\s+)?([+-]?\d+(?:\.\d+)?)(?:\s+[A-Z]{2,4})?$/i);
  if (!match) return null;
  const number = Math.abs(Number(match[1]));
  return Number.isFinite(number) && number <= 40 ? number : null;
}

export type DoubleCandidate = {
  id: string; startTime: Date; spreadLine: string | null;
  isFinal: boolean; statusState: string | null;
};

export function closestSpreadGame<T extends DoubleCandidate>(games: T[], now: Date): T | null {
  return games.filter(g => !g.isFinal && g.statusState === 'pre' && g.startTime > now && absoluteSpread(g.spreadLine) !== null)
    .sort((a, b) => absoluteSpread(a.spreadLine)! - absoluteSpread(b.spreadLine)!
      || a.startTime.getTime() - b.startTime.getTime() || a.id.localeCompare(b.id))[0] ?? null;
}
