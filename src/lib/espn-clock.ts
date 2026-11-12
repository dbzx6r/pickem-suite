export function normalizeEspnClock(clock: unknown, displayClock?: unknown): string | null {
  if (typeof displayClock === 'string' && displayClock.trim()) return displayClock.trim();
  if (typeof clock === 'string' && clock.trim()) return clock.trim();
  if (typeof clock === 'number' && Number.isFinite(clock)) {
    const totalSeconds = Math.max(0, Math.floor(clock));
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }
  return null;
}
