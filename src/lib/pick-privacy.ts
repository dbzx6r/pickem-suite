export function isGamePickRevealed(startTime: Date | string, now = new Date()): boolean {
  return new Date(startTime).getTime() <= now.getTime();
}

export function canViewPick(input: {
  ownerId: string;
  viewerId: string;
  startTime: Date | string;
  now?: Date;
}): boolean {
  return input.ownerId === input.viewerId || isGamePickRevealed(input.startTime, input.now);
}

export function isWeekClosed(games: Array<{ startTime: Date | string }>, now = new Date()): boolean {
  return games.length > 0 && games.every((game) => isGamePickRevealed(game.startTime, now));
}
