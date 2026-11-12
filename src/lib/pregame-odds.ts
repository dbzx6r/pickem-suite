export type Odds = { spreadLine: string | null; overUnder: number | null; oddsProvider: string | null };
export type OddsSnapshot = { spreadLine: string | null; overUnder: number | null; provider: string | null; capturedAt: Date | string };
export function recordedPregameOdds(startTime: Date | string, snapshots: OddsSnapshot[]) {
  const snapshot = snapshots.filter(s => new Date(s.capturedAt).getTime() < new Date(startTime).getTime())
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0];
  return { spreadLine: snapshot?.spreadLine ?? null, overUnder: snapshot?.overUnder ?? null,
    oddsProvider: snapshot?.provider ?? null, oddsCapturedAt: snapshot?.capturedAt ?? null };
}
export function oddsArePregame(game: { startTime: Date; isFinal: boolean; statusState: string | null }, now = new Date()) {
  return !game.isFinal && game.statusState === 'pre' && game.startTime > now;
}
export function retainAvailableOdds(incoming: Odds, existing: Odds): Odds {
  return { spreadLine: incoming.spreadLine ?? existing.spreadLine,
    overUnder: incoming.overUnder ?? existing.overUnder,
    oddsProvider: incoming.oddsProvider ?? existing.oddsProvider };
}
export function bonusSpread(details: unknown, gameId: string): string | null {
  if (!details || typeof details !== 'object') return null;
  const value = details as Record<string, unknown>;
  return value.gameId === gameId && typeof value.spreadLine === 'string' ? value.spreadLine : null;
}
