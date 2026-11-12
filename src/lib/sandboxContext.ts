export const SANDBOX_COOKIE = 'nfl_sandbox_mode';

export function isSandboxModeFromCookieHeader(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(';').some(c => c.trim() === `${SANDBOX_COOKIE}=1`);
}

export function isSandboxModeClient(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some(c => c.trim() === `${SANDBOX_COOKIE}=1`);
}
