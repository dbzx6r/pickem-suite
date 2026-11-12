export type ScoringGame = {
  id: string; homeTeam: string; awayTeam: string; isFinal: boolean;
  homeScore: number | null; awayScore: number | null; winnerTeam: string | null;
};

export function isFinalTie(game: ScoringGame): boolean {
  return game.isFinal && game.homeScore !== null && game.awayScore !== null
    && game.homeScore === game.awayScore;
}

/** A tied final credits either submitted team exactly once, never a double bonus. */
export function gradeFinalPick(game: ScoringGame, pickedTeam: string, doubleGameId: string | null) {
  if (!game.isFinal) return null;
  const validTeam = pickedTeam === game.homeTeam || pickedTeam === game.awayTeam;
  if (isFinalTie(game)) return { isCorrect: validTeam, pointsEarned: validTeam ? 1 : 0 };
  if (!game.winnerTeam) return null;
  const isCorrect = validTeam && game.winnerTeam === pickedTeam;
  return { isCorrect, pointsEarned: isCorrect ? (game.id === doubleGameId ? 2 : 1) : 0 };
}

export function projectedPickPoints(game: ScoringGame, pickedTeam: string, doubleGameId: string | null) {
  if (game.isFinal) return gradeFinalPick(game, pickedTeam, doubleGameId)?.pointsEarned ?? 0;
  const leader = game.winnerTeam ?? (game.homeScore !== null && game.awayScore !== null && game.homeScore !== game.awayScore
    ? game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam : null);
  return leader === pickedTeam ? (game.id === doubleGameId ? 2 : 1) : 0;
}
