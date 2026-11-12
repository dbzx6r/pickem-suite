export type LiveGame = {
  isFinal: boolean; statusState: string | null; homeScore: number | null; awayScore: number | null;
  period: number | null; clock: string | null; possession: string | null; downDistance: string | null;
};
export function activityPayload(game: LiveGame, now = Date.now()) {
  const timestamp = Math.floor(now / 1000);
  const finished = game.isFinal || game.statusState !== 'in';
  return { aps: {
    timestamp, event: finished ? 'end' : 'update',
    'content-state': {
      homeScore: game.homeScore, awayScore: game.awayScore,
      status: game.isFinal ? 'FINAL' : game.statusState === 'in' ? 'LIVE' : 'UNAVAILABLE',
      period: game.isFinal ? 'FINAL' : game.period ? game.period > 4 ? 'OT' : `Q${game.period}` : 'LIVE',
      clock: game.clock, possession: game.possession, downDistance: game.downDistance,
      updatedAt: now / 1000,
    },
    ...(finished ? { 'dismissal-date': timestamp + (game.isFinal ? 1800 : 0) } : { 'stale-date': timestamp + 360 }),
  } };
}
export function validActivityRegistration(body: Record<string, unknown>) {
  return typeof body.activityId === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(body.activityId)
    && typeof body.gameId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(body.gameId)
    && typeof body.token === 'string' && /^[a-f0-9]{64,512}$/.test(body.token) && body.token.length % 2 === 0
    && (body.environment === 'sandbox' || body.environment === 'production');
}
export function invalidAPNsToken(status: number, reason?: string) {
  return status === 410 || (status === 400 && ['BadDeviceToken', 'DeviceTokenNotForTopic'].includes(reason ?? ''));
}
