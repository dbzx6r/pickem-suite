import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

type GamePick = {
  pickedTeam: string;
  isCorrect: boolean | null;
  pointsEarned: number;
  isAutoPick: boolean;
} | null;

type GameEntry = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  isFinal: boolean;
  startTime: string;
  pick: GamePick;
};

type WeekScore = {
  points: number;
  finalRank: number | null;
  tiebreakerUsed: boolean;
} | null;

type WeekEntry = {
  weekId: string;
  weekNumber: number;
  lockTime: string;
  isFinal: boolean;
  recapVisible: boolean;
  score: WeekScore;
  games: GameEntry[];
};

type SeasonHistoryResponse = { weeks: WeekEntry[] };

function rankEmoji(rank: number | null | undefined): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  if (rank) return `#${rank}`;
  return '';
}

function PickBadge({ pick, game }: { pick: GamePick; game: GameEntry }) {
  if (!pick) {
    return <span className="text-xs text-muted-foreground">No pick</span>;
  }
  if (!game.isFinal) {
    return (
      <Badge variant="secondary" className="text-xs bg-accent text-muted-foreground border-border">
        ⚫ {pick.pickedTeam}
      </Badge>
    );
  }
  if (pick.isCorrect) {
    return (
      <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
        ✅ {pick.pickedTeam} +{pick.pointsEarned}pt
      </Badge>
    );
  }
  return (
    <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30">
      ❌ {pick.pickedTeam}
    </Badge>
  );
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const session = await auth();
  const { userId } = await searchParams;
  const targetUserId = userId ?? session?.user?.id;

  if (!targetUserId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-xl text-muted-foreground">Please log in to view season history.</p>
      </div>
    );
  }

  let viewedUser: { displayName: string; avatarUrl: string | null } | null = null;
  const isOwnHistory = session?.user?.id === targetUserId;

  if (!isOwnHistory) {
    const profile = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { profile: true },
    });
    if (profile?.profile) {
      viewedUser = { displayName: profile.profile.displayName, avatarUrl: profile.profile.avatarUrl };
    } else if (profile) {
      viewedUser = { displayName: profile.email, avatarUrl: null };
    }
  }

  let data: SeasonHistoryResponse = { weeks: [] };
  try {
    const res = await fetch(
      `${process.env.NEXTAUTH_URL_INTERNAL}/api/users/${targetUserId}/season-history`,
      { cache: 'no-store', headers: { cookie: (await headers()).get('cookie') ?? '' } },
    );
    if (res.ok) data = (await res.json()) as SeasonHistoryResponse;
  } catch {
    // fall back to empty
  }

  const { weeks } = data;
  const initials = viewedUser
    ? viewedUser.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        {viewedUser && (
          <Avatar className="h-10 w-10">
            {viewedUser.avatarUrl && (
              <AvatarImage src={viewedUser.avatarUrl} alt={viewedUser.displayName} />
            )}
            <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        )}
        <h1 className="text-3xl font-black">
          {viewedUser ? `${viewedUser.displayName}'s Season History` : 'Season History'}
        </h1>
      </div>

      {weeks.length === 0 && (
        <Card className="glass-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No season history available yet.</p>
          </CardContent>
        </Card>
      )}

      {weeks.map((week) => {
        const allUpcoming = week.games.length > 0 && week.games.every((g) => !g.isFinal && !g.pick);
        const lockDate = new Date(week.lockTime);
        const dateLabel = lockDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const rankText = rankEmoji(week.score?.finalRank);

        return (
          <Card key={week.weekId} className="glass-card border-border overflow-hidden">
            {/* Card Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold text-base">Week {week.weekNumber}</span>
                <span className="text-muted-foreground text-sm">· {dateLabel}</span>
                {week.score != null && (
                  <Badge variant="secondary" className="text-sm bg-accent border-border">
                    {rankText && <span className="mr-1">{rankText}</span>}
                    {week.score.finalRank && rankText ? `· ${week.score.points} pts` : `${week.score.points} pts`}
                  </Badge>
                )}
              </div>
              {week.recapVisible && (
                <Link
                  href={`/recap/${week.weekNumber}`}
                  className="flex items-center gap-0.5 text-sm text-primary hover:underline shrink-0"
                >
                  View Recap <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            {/* Games */}
            <CardContent className="p-0">
              {allUpcoming ? (
                <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                  No picks yet
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {week.games.map((game) => (
                    <div
                      key={game.gameId}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {game.awayTeam} @ {game.homeTeam}
                        </span>
                        {game.isFinal && game.homeScore != null && game.awayScore != null ? (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {game.winnerTeam === game.homeTeam
                              ? `${game.homeTeam} ${game.homeScore}–${game.awayScore}`
                              : `${game.awayTeam} ${game.awayScore}–${game.homeScore}`}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground shrink-0">Upcoming</span>
                        )}
                      </div>
                      <div className="ml-2 shrink-0">
                        <PickBadge pick={game.pick} game={game} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
