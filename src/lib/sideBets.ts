import { prisma } from './prisma';

export async function resolveSideBetsForNFLGame(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || !game.isFinal) return;

  const bets = await prisma.sideBet.findMany({
    where: { gameId, status: 'accepted' },
  });

  for (const bet of bets) {
    let winnerId: string | null = null;

    if (bet.betType === 'winner') {
      const details = bet.betDetails as { team: string };
      if (game.winnerTeam && details.team === game.winnerTeam) {
        winnerId = bet.proposerId;
      } else if (game.winnerTeam) {
        winnerId = bet.acceptorId;
      }
    } else if (bet.betType === 'spread') {
      const details = bet.betDetails as { team: string; value: number };
      const homeScore = game.homeScore ?? 0;
      const awayScore = game.awayScore ?? 0;
      const margin =
        game.homeTeam === details.team
          ? homeScore - awayScore
          : awayScore - homeScore;
      if (margin > details.value) {
        winnerId = bet.proposerId;
      } else if (margin < details.value) {
        winnerId = bet.acceptorId;
      }
      // null = push
    } else if (bet.betType === 'total') {
      const details = bet.betDetails as { direction: 'over' | 'under'; value: number };
      const combined = (game.homeScore ?? 0) + (game.awayScore ?? 0);
      if (details.direction === 'over' && combined > details.value) {
        winnerId = bet.proposerId;
      } else if (details.direction === 'under' && combined < details.value) {
        winnerId = bet.proposerId;
      } else if (combined !== details.value) {
        winnerId = bet.acceptorId;
      }
    }

    await prisma.sideBet.update({
      where: { id: bet.id },
      data: { status: 'resolved', winnerId, resolvedAt: new Date() },
    });
  }
}

// No-op for MLB games in the NFL app
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function resolveSideBetsForMLBGame(_mlbGameId: string): Promise<void> {
  return;
}
