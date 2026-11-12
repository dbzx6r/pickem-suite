type Props = {
  spreadLine?: string | null; overUnder?: number | null; oddsProvider?: string | null;
  bonusSelectionSpread?: string | null; isFinal: boolean; isPregame?: boolean;
  homeScore: number | null; awayScore: number | null;
};
export default function OddsSummary(game: Props) {
  const hasOdds = Boolean(game.spreadLine || game.overUnder != null);
  return <div className="mt-2 space-y-1 text-center text-xs text-muted-foreground">
    {hasOdds ? <>
      <p>{game.isPregame ? 'Pregame odds' : 'Last recorded pregame odds'}{game.oddsProvider ? ` · ${game.oddsProvider}` : ''}</p>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {game.spreadLine && <span>Spread: <span className="text-foreground">{game.spreadLine}</span></span>}
        {game.overUnder != null && <span>O/U: <span className="text-foreground">{game.overUnder}</span></span>}
      </div>
    </> : !game.isPregame && <p>Pregame odds weren’t recorded for this game.</p>}
    {game.bonusSelectionSpread && <p className="text-amber-300">Tuesday 2× selection spread: {game.bonusSelectionSpread}</p>}
    {game.isFinal && game.homeScore != null && game.awayScore != null && <p>
      Final margin: {Math.abs(game.homeScore - game.awayScore)} points · Total: {game.homeScore + game.awayScore}
    </p>}
  </div>;
}
