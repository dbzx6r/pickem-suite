import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Lock, CheckCircle, ClipboardCheck } from 'lucide-react';
import { PRESEASON, seasonTitle } from '@/lib/season';
import { getOpenWeekIds } from '@/lib/pick-window';
import { cookies } from 'next/headers';
import { SANDBOX_COOKIE } from '@/lib/sandboxContext';
import WeekNavigator from '@/components/WeekNavigator';
import { weekLabel } from '@/lib/week-labels';
import { gameIsOpen, AvailabilityGame } from '@/lib/game-availability';

type WeekEntry = {
  id: string;
  weekNumber: number;
  lockTime: Date;
  isFinal: boolean;
  games: (AvailabilityGame & { id: string; startTime: Date })[];
  picks: { id: string }[];
};

export default async function PicksPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const cookieStore = await cookies();
  const isSandbox = cookieStore.get(SANDBOX_COOKIE)?.value === '1';
  if (session.user.role === 'ADMIN' && !isSandbox) redirect('/admin');

  const [activeSeason, settings] = await Promise.all([prisma.season.findFirst({
    where: isSandbox ? { isSandbox: true } : { isActive: true, isSandbox: false },
    orderBy: isSandbox ? { id: 'desc' } : undefined,
    include: {
      weeks: {
        orderBy: { weekNumber: 'asc' },
        include: {
          games: { orderBy: { startTime: 'asc' } },
          picks: { where: { userId: session.user.id as string } },
        },
      },
    },
  }), prisma.leagueSettings.findUnique({ where: { id: 'default' }, select: { pickWindowWeeks: true } })]);

  if (!activeSeason) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-4">🏈</div>
        <h2 className="text-xl font-semibold">No active season</h2>
        <p className="text-muted-foreground mt-2">Check back when the season starts!</p>
      </div>
    );
  }

  const weeks = activeSeason.weeks as WeekEntry[];

  if (weeks.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-black gradient-text">📋 My Picks</h1>
        <Card className="glass-card border-border">
          <CardContent className="py-12 text-center">
            <div className="text-4xl mb-4">🏈</div>
            <h2 className="text-xl font-semibold">
              {seasonTitle(activeSeason.year, activeSeason.seasonType)} coming soon
            </h2>
            <p className="text-muted-foreground mt-2">
              Picks will appear here when the next schedule is ready.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const pickWindowWeeks = settings?.pickWindowWeeks ?? 2;
  const openWeekIds = getOpenWeekIds(weeks, now, pickWindowWeeks);
  const preservedLocks = await prisma.auditLog.findMany({where:{id:{in:weeks.flatMap(w=>w.games.map(g=>`game-lock:${g.id}`))}},select:{targetId:true}});
  const lockedIds = new Set(preservedLocks.map(row=>row.targetId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black gradient-text sm:text-3xl">📋 {isSandbox ? 'Sandbox Picks' : 'My Picks'}</h1>
        <Link href="/pick-status" className="shrink-0">
          <Button variant="outline" className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Pick Check
          </Button>
        </Link>
      </div>
      {isSandbox && (
        <p className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
          Commissioner rehearsal mode — these picks belong only to the sandbox season.
        </p>
      )}
      {activeSeason.seasonType === PRESEASON && (
        <p className="text-sm text-amber-300">
          Preseason testing — standings and profile statistics reset when the regular season starts.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        The next {pickWindowWeeks} week{pickWindowWeeks === 1 ? '' : 's'} {pickWindowWeeks === 1 ? 'is' : 'are'} open for picks. Each game locks individually when it starts.
      </p>
      <WeekNavigator />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {weeks.map((week) => {
          const futureGames = week.games.filter((game) => gameIsOpen({...game,pickLocked:lockedIds.has(game.id)},now));
          const isFullyLocked = futureGames.length === 0;
          const isOpen = openWeekIds.has(week.id) && !isFullyLocked;
          const isQueued = !week.isFinal && !isFullyLocked && !isOpen;
          const picksCount = week.picks.length;
          const gamesCount = week.games.length;
          const isComplete = week.isFinal;

          return (
            <Link key={week.id} href={`/picks/${week.weekNumber}`}>
              <Card className="glass-card border-border hover:border-border transition-all cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {activeSeason.seasonType === PRESEASON ? 'Preseason ' : ''}Week {week.weekNumber}
                      <span className="mt-1 block text-xs font-medium text-muted-foreground">{weekLabel(week,weeks)}</span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {isComplete && (
                        <Badge variant="outline" className="border-green-500/50 text-green-400 text-xs">
                          Final
                        </Badge>
                      )}
                      {isFullyLocked && !isComplete && (
                        <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                          <Lock className="h-3 w-3 mr-1" />
                          Locked
                        </Badge>
                      )}
                      {isOpen && (
                        <Badge variant="outline" className="border-primary/50 text-primary text-xs">
                          Open
                        </Badge>
                      )}
                      {isQueued && (
                        <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                          Coming soon
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {gamesCount} games
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {picksCount}/{gamesCount} picked
                    </span>
                  </div>
                  {isOpen && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Next game locks: {futureGames[0]?.startTime.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                  {isQueued && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Opens after an earlier week&apos;s last kickoff.
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
