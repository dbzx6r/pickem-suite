export type AvailabilityGame = { startTime: Date | string; statusState?: string | null; isFinal?: boolean; pickLocked?: boolean };
export function gameIsOpen(game: AvailabilityGame, now = new Date()) {
  return !game.pickLocked && !game.isFinal && (!game.statusState || game.statusState === 'pre') && new Date(game.startTime).getTime() > now.getTime();
}
export function gameHasStarted(game: AvailabilityGame, now = new Date()) {
  return Boolean(game.isFinal || ['in','post','suspended'].includes(game.statusState ?? '') || new Date(game.startTime).getTime() <= now.getTime());
}
export function scheduleChanged(before: AvailabilityGame, after: AvailabilityGame) {
  return new Date(before.startTime).getTime() !== new Date(after.startTime).getTime() ||
    (before.statusState !== after.statusState && [before.statusState,after.statusState].some(s=>['postponed','canceled','suspended'].includes(s ?? '')));
}
