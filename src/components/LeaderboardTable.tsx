'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import StreakBadge from '@/components/StreakBadge';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import type { WeeklyWinner } from '@/lib/weekly-winner';
import TeamLogo from '@/components/TeamLogo';
import { NFL_TEAMS } from '@/lib/espn';
import ScoreBreakdown, { ScoreWeek } from '@/components/ScoreBreakdown';

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  favoriteTeam?: string | null;
  scoreBreakdown?: ScoreWeek[];
  totalPoints: number;
  bestWeek: number;
  pickPercentage: number;
  currentStreak: number;
  weeklyData: Array<{ week: number; points: number; rank: number | null }>;
  weeksWon: number;
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  weeklyWinner?: WeeklyWinner | null;
  currentWeekId?: string;
  weeklyScoresMap?: Record<string, { points: number; rank: number | null }>;
}

const rankStyles: Record<number, string> = {
  1: 'rank-gold',
  2: 'rank-silver',
  3: 'rank-bronze',
};

function FavoriteTeamLogo({ team }: { team?: string | null }) {
  if (!team || !NFL_TEAMS[team]) return null;
  const name = `${NFL_TEAMS[team].city} ${NFL_TEAMS[team].name}`;
  return <span className="inline-flex shrink-0 rounded-md bg-white p-0.5" title={`Favorite team: ${name}`} aria-label={`Favorite team: ${name}`}><TeamLogo abbreviation={team} size={22} /></span>;
}

const rankBgs: Record<number, string> = {
  1: 'bg-yellow-500/5 border-yellow-500/20',
  2: 'bg-gray-400/5 border-gray-400/20',
  3: 'bg-orange-600/5 border-orange-600/20',
};

export default function LeaderboardTable({
  entries,
  weeklyScoresMap,
  weeklyWinner = null,
  currentWeekId,
}: LeaderboardTableProps) {
  const router = useRouter();
  const live = useLeaderboard();
  const displayedEntries = live.isLoading || live.error ? entries : live.entries;
  const winner = live.isLoading || live.error ? weeklyWinner : live.weeklyWinner;
  const displayedWeeklyScores =
    live.isLoading || live.error ? weeklyScoresMap : live.weeklyScoresMap;

  const sorted = [...displayedEntries].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div className="space-y-2">
      {winner && (
        <section aria-label={`Week ${winner.weekNumber} winner`} className="mb-6 rounded-2xl border-2 border-amber-400/70 bg-gradient-to-br from-amber-500/20 via-amber-400/10 to-transparent p-5 shadow-[0_0_30px_rgba(251,191,36,0.22)] sm:p-6">
          <div className="flex items-start gap-4">
            <Trophy aria-hidden="true" className="mt-1 h-10 w-10 shrink-0 text-amber-400" />
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-widest text-amber-400">Week {winner.weekNumber} Winner</p>
              <a href={`/profile/${winner.userId}`} className="mt-1 flex items-center gap-2 text-3xl font-black text-foreground [text-shadow:0_0_24px_rgba(251,191,36,0.45)] hover:underline focus-visible:underline sm:text-4xl"><span className="min-w-0 break-words">{winner.displayName}</span><FavoriteTeamLogo team={displayedEntries.find(entry => entry.id === winner.userId)?.favoriteTeam} /></a>
              <p className="mt-2 text-sm font-semibold">{winner.points} points · All games final</p>
              <p className="mt-1 text-xs text-muted-foreground">Reigning weekly winner until the next week is complete.</p>
            </div>
          </div>
        </section>
      )}
      {/* Header */}
      <div className="grid grid-cols-12 text-xs text-muted-foreground px-4 mb-1">
        <div className="col-span-1">#</div>
        <div className="col-span-5">Player</div>
        <div className="col-span-2 text-right">Total</div>
        <div className="col-span-2 text-right">This Wk</div>
        <div className="col-span-2 text-right">Acc%</div>
      </div>

      {sorted.map((entry, index) => {
        const rank = index + 1;
        const isWeeklyWinner = winner?.userId === entry.id;
        const thisWeek = displayedWeeklyScores?.[entry.id];
        const initials = entry.displayName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);

        return (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04 }}
            whileHover={{ scale: 1.01 }}
            onClick={() => router.push(`/profile/${entry.id}`)}
            className={cn(
              'glass-card grid grid-cols-12 items-center px-4 py-3 cursor-pointer border transition-all',
              isWeeklyWinner
                ? 'border-amber-400/80 bg-amber-500/10 shadow-[0_0_20px_rgba(251,191,36,0.25)]'
                : rankBgs[rank] || 'border-border hover:border-border'
            )}
          >
            {/* Rank */}
            <div className="col-span-1">
              {rank <= 3 ? (
                <span className={cn('font-black text-lg', rankStyles[rank])}>
                  {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
                </span>
              ) : (
                <span className="text-muted-foreground font-semibold">{rank}</span>
              )}
            </div>

            {/* Name */}
            <div className="col-span-5 min-w-0 flex items-center gap-2 sm:gap-3">
              <Avatar className="hidden h-8 w-8 shrink-0 sm:flex">
                {entry.avatarUrl && <AvatarImage src={entry.avatarUrl} alt={entry.displayName} />}
                <AvatarFallback
                  className="bg-primary/15 text-primary text-xs font-bold"
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5"><span title={entry.displayName} className={cn('min-w-0 font-semibold truncate', isWeeklyWinner && 'text-amber-400 font-black')}>{entry.displayName}</span><FavoriteTeamLogo team={entry.favoriteTeam} /></div>
                {isWeeklyWinner && <div className="text-[10px] font-bold text-amber-400">🏆 Week {winner.weekNumber} winner</div>}
                <div className="flex items-center gap-1">
                  {entry.weeksWon > 0 && (
                    <span className="text-[10px] text-yellow-500 flex items-center gap-0.5">
                      <Trophy className="h-2.5 w-2.5" />
                      {entry.weeksWon}
                    </span>
                  )}
                  {entry.currentStreak > 0 && (
                    <StreakBadge streak={entry.currentStreak} />
                  )}
                </div>
              </div>
            </div>

            {/* Total Points */}
            <div className="col-span-2 text-right">
              <span className={cn('font-bold text-lg', rankStyles[rank] || 'text-foreground')}>
                <ScoreBreakdown name={entry.displayName} weeks={entry.scoreBreakdown ?? []}>{entry.totalPoints}</ScoreBreakdown>
              </span>
            </div>

            {/* This week */}
            <div className="col-span-2 text-right">
              {thisWeek ? (
                <span className="text-sm font-semibold text-primary">
                  <ScoreBreakdown name={entry.displayName} weeks={entry.scoreBreakdown ?? []} weekId={live.currentWeekId ?? currentWeekId}>+{thisWeek.points}</ScoreBreakdown>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>

            {/* Accuracy */}
            <div className="col-span-2 text-right">
              <span className="text-sm text-muted-foreground">{entry.pickPercentage}%</span>
            </div>
          </motion.div>
        );
      })}

      {displayedEntries.length === 0 && (
        <div className="text-center text-muted-foreground py-12">
          No players yet. Be the first to register!
        </div>
      )}
    </div>
  );
}
