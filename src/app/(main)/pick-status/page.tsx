import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle2, CircleAlert, ClipboardCheck, Hash } from 'lucide-react';
import { getOpenWeekIds } from '@/lib/pick-window';
import { PRESEASON, seasonTitle } from '@/lib/season';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type PickStatusPageProps = {
  searchParams?: Promise<{ week?: string }>;
};

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default async function PickStatusPage({ searchParams }: PickStatusPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeSeason = await prisma.season.findFirst({
    where: { isActive: true, isSandbox: false },
    include: {
      weeks: {
        orderBy: { weekNumber: 'asc' },
        include: {
          games: {
            select: { id: true, startTime: true },
            orderBy: { startTime: 'asc' },
          },
        },
      },
    },
  });

  if (!activeSeason || activeSeason.weeks.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black gradient-text">Pick Check</h1>
          <p className="text-muted-foreground mt-1">No active weekly slate is available yet.</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const settings = await prisma.leagueSettings.findUnique({ where: { id: 'default' }, select: { pickWindowWeeks: true } });
  const openWeekIds = getOpenWeekIds(activeSeason.weeks, now, settings?.pickWindowWeeks ?? 2);
  const requestedWeekNumber = Number(resolvedSearchParams?.week);
  const requestedWeek = Number.isInteger(requestedWeekNumber)
    ? activeSeason.weeks.find((week) => week.weekNumber === requestedWeekNumber)
    : undefined;
  const selectedWeek =
    requestedWeek ??
    activeSeason.weeks.find((week) => openWeekIds.has(week.id)) ??
    activeSeason.weeks.at(-1)!;

  const users = await prisma.user.findMany({
    where: { role: 'USER' },
    select: {
      id: true,
      email: true,
      profile: {
        select: { displayName: true, avatarUrl: true },
      },
      picks: {
        where: { weekId: selectedWeek.id },
        select: { id: true },
      },
      tiebreakers: {
        where: { weekId: selectedWeek.id },
        select: { id: true },
        take: 1,
      },
    },
  });

  const totalGames = selectedWeek.games.length;
  const requiresTiebreaker = Boolean(selectedWeek.tiebreakerGameId);
  const participantRows = users
    .map((user) => {
      const displayName = user.profile?.displayName ?? user.email.split('@')[0];
      const pickCount = user.picks.length;
      const picksComplete = totalGames > 0 && pickCount === totalGames;
      const tiebreakerComplete = !requiresTiebreaker || user.tiebreakers.length > 0;

      return {
        id: user.id,
        displayName,
        avatarUrl: user.profile?.avatarUrl ?? null,
        pickCount,
        picksComplete,
        tiebreakerComplete,
        complete: picksComplete && tiebreakerComplete,
      };
    })
    .sort(
      (a, b) =>
        Number(a.complete) - Number(b.complete) ||
        a.displayName.localeCompare(b.displayName),
    );

  const completeCount = participantRows.filter((row) => row.complete).length;
  const needsPicksCount = participantRows.filter((row) => !row.picksComplete).length;
  const needsTiebreakerCount = participantRows.filter((row) => !row.tiebreakerComplete).length;
  const isSelectedWeekOpen = openWeekIds.has(selectedWeek.id);
  const isSelectedWeekLocked = selectedWeek.games.every((game) => game.startTime <= now);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black gradient-text flex items-center gap-2">
            <ClipboardCheck className="h-8 w-8" />
            Pick Check
          </h1>
          <p className="text-muted-foreground mt-1">
            See who still needs a reminder. Team selections remain private.
          </p>
        </div>
        <Link
          href={`/picks/${selectedWeek.weekNumber}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          View my Week {selectedWeek.weekNumber} picks
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {activeSeason.weeks.map((week) => {
          const selected = week.id === selectedWeek.id;
          const open = openWeekIds.has(week.id);

          return (
            <Link
              key={week.id}
              href={`/pick-status?week=${week.weekNumber}`}
              className={cn(
                'shrink-0 rounded-lg border px-3 py-2 text-sm transition-colors',
                selected
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-muted/50 text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {activeSeason.seasonType === PRESEASON ? 'Preseason ' : ''}Week {week.weekNumber}
              {week.isFinal ? ' · Final' : open ? ' · Open' : ''}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">
          {seasonTitle(activeSeason.year, activeSeason.seasonType)} · Week {selectedWeek.weekNumber}
        </h2>
        <Badge
          variant="outline"
          className={cn(
            isSelectedWeekOpen
              ? 'border-emerald-500/50 text-emerald-400'
              : 'border-border text-muted-foreground',
          )}
        >
          {selectedWeek.isFinal ? 'Final' : isSelectedWeekOpen ? 'Open' : isSelectedWeekLocked ? 'Locked' : 'Coming soon'}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="glass-card border-emerald-500/20">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Complete</p>
            <p className="text-2xl font-black text-emerald-400">{completeCount}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-amber-500/20">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Still need picks</p>
            <p className="text-2xl font-black text-amber-400">{needsPicksCount}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-violet-500/20">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Need tiebreaker</p>
            <p className="text-2xl font-black text-violet-400">{needsTiebreakerCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-border overflow-hidden">
        <CardContent className="p-0">
          <div className="divide-y divide-white/10">
            {participantRows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10">
                    {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt={row.displayName} />}
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                      {initialsFor(row.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{row.displayName}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className={row.picksComplete ? 'text-emerald-400' : 'text-amber-400'}>
                        {row.pickCount}/{totalGames} picks
                      </span>
                      <span className={row.tiebreakerComplete ? 'text-foreground' : 'text-violet-400'}>
                        Tiebreaker: {requiresTiebreaker ? (row.tiebreakerComplete ? 'Submitted' : 'Missing') : 'Not required'}
                      </span>
                    </div>
                  </div>
                </div>

                {row.complete ? (
                  <Badge variant="outline" className="w-fit border-emerald-500/50 text-emerald-400">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Complete
                  </Badge>
                ) : (
                  <Badge variant="outline" className="w-fit border-amber-500/50 text-amber-400">
                    <CircleAlert className="mr-1 h-3.5 w-3.5" />
                    {!row.picksComplete && !row.tiebreakerComplete
                      ? `${totalGames - row.pickCount} picks + tiebreaker`
                      : !row.picksComplete
                        ? `${totalGames - row.pickCount} pick${totalGames - row.pickCount === 1 ? '' : 's'} missing`
                        : 'Tiebreaker missing'}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Pick Check only shows whether a tiebreaker was submitted. Each participant&apos;s number remains private.
      </p>
    </div>
  );
}
