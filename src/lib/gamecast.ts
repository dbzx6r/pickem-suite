export function clampFieldPosition(yardLine: number): number {
  return Math.min(100, Math.max(0, yardLine));
}

export function shortDownDistance(shortText: string | null, fullText: string | null): string {
  if (shortText?.trim()) return shortText.trim();
  if (!fullText?.trim()) return '—';
  return fullText.split(/\s+at\s+/i)[0]?.trim() || fullText.trim();
}

export function ballOnText(
  possessionText: string | null,
  yardLine: number | null,
  awayTeam: string,
  homeTeam: string,
): string {
  if (possessionText?.trim()) return possessionText.trim();
  if (yardLine === null || !Number.isFinite(yardLine)) return '—';

  const position = Math.round(clampFieldPosition(yardLine));
  if (position === 50) return '50';
  return position < 50 ? `${awayTeam} ${position}` : `${homeTeam} ${100 - position}`;
}

export function firstDownFieldPosition(
  yardLine: number | null,
  distance: number | null,
  possession: string | null,
  awayTeam: string,
  homeTeam: string,
): number | null {
  if (
    yardLine === null ||
    distance === null ||
    !Number.isFinite(yardLine) ||
    !Number.isFinite(distance) ||
    distance <= 0
  ) {
    return null;
  }

  const direction = possession === awayTeam ? 1 : possession === homeTeam ? -1 : 0;
  if (direction === 0) return null;
  const firstDown = yardLine + (direction * distance);
  return firstDown > 0 && firstDown < 100 ? clampFieldPosition(firstDown) : null;
}
