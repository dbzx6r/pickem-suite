export type FinalState = { isFinal: boolean };

export function getLiveScoringDecision(games: FinalState[]) {
  const finalGameCount = games.filter((game) => game.isFinal).length;

  return {
    finalGameCount,
    shouldCalculate: finalGameCount > 0,
    shouldFinalize: games.length > 0 && finalGameCount === games.length,
  };
}
