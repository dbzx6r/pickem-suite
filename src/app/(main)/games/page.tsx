'use client';

import { useLiveGames } from '@/hooks/useLiveGames';
import GameCard from '@/components/GameCard';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { useSearchParams } from 'next/navigation';
import { useSandbox } from '@/contexts/SandboxContext';

export default function GamesPage() {
  const searchParams = useSearchParams();
  const requestedWeek = Number(searchParams.get('week'));
  const weekNumber = Number.isInteger(requestedWeek) && requestedWeek > 0 ? requestedWeek : undefined;
  const { isSandbox } = useSandbox();
  const { games, isLoading, refresh } = useLiveGames(weekNumber, isSandbox);

  const liveGames = games.filter((g) => g.statusState === 'in');
  const preGames = games.filter((g) => g.statusState === 'pre');
  const finalGames = games.filter((g) => g.statusState === 'post' || g.isFinal);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black gradient-text sm:text-3xl">📺 {isSandbox ? 'Sandbox Games' : 'Games'}</h1>
          <p className="text-muted-foreground mt-1">
            {liveGames.length > 0 ? (
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse inline-block" />
                {liveGames.length} game{liveGames.length !== 1 ? 's' : ''} live
              </span>
            ) : (
              'Current week scores'
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh()} className="shrink-0 gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Live Games */}
      {liveGames.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-bold">In Progress</h2>
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
              {liveGames.length} LIVE
            </Badge>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {liveGames.map((game, i) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <GameCard game={game} showGamecast />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {preGames.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3">Upcoming</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {preGames.map((game, i) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <GameCard game={game} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Final */}
      {finalGames.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3">Final</h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {finalGames.map((game, i) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <GameCard game={game} showGamecast />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {games.length === 0 && (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">🏈</div>
          <h2 className="text-xl font-semibold">No games scheduled</h2>
          <p className="text-muted-foreground mt-2">Check back closer to game day!</p>
        </div>
      )}
    </div>
  );
}
