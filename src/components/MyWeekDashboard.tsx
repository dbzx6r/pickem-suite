import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getOpenWeekIds } from '@/lib/pick-window';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, CalendarCheck, Clock, Swords } from 'lucide-react';

export default async function MyWeekDashboard({ userId }: { userId: string }) {
  const season = await prisma.season.findFirst({
    where: { isActive: true, isSandbox: false },
    include: { weeks: { orderBy: { weekNumber: 'asc' }, include: { games: { orderBy: { startTime: 'asc' } } } } },
  });
  if (!season) return null;
  const now = new Date();
  const settings = await prisma.leagueSettings.findUnique({ where: { id: 'default' }, select: { pickWindowWeeks: true } });
  const openIds = getOpenWeekIds(season.weeks, now, settings?.pickWindowWeeks ?? 2);
  const week = season.weeks.find((item) => openIds.has(item.id));
  if (!week) return null;
  const [pickCount, tiebreaker, pendingBets, unread] = await Promise.all([
    prisma.pick.count({ where: { userId, weekId: week.id } }),
    prisma.tiebreaker.findUnique({ where: { userId_weekId: { userId, weekId: week.id } }, select: { id: true } }),
    prisma.sideBet.count({ where: { acceptorId: userId, status: 'pending', sport: 'nfl' } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  const nextGame = week.games.find((game) => game.startTime > now);
  const missing = Math.max(0, week.games.length - pickCount);
  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-primary">My Week</p><h2 className="text-xl font-black">Week {week.weekNumber}</h2></div>
          <Badge variant="outline" className={missing === 0 && tiebreaker ? 'border-emerald-500/50 text-emerald-400' : 'border-amber-500/50 text-amber-400'}>
            {missing === 0 && tiebreaker ? 'Entry complete' : 'Action needed'}
          </Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Link href={`/picks/${week.weekNumber}`} className="rounded-lg bg-muted/50 p-3 hover:bg-accent">
            <CalendarCheck className="mb-1 h-4 w-4 text-primary" /><p className="font-bold">{pickCount}/{week.games.length}</p><p className="text-xs text-muted-foreground">picks submitted</p>
          </Link>
          <Link href={`/picks/${week.weekNumber}`} className="rounded-lg bg-muted/50 p-3 hover:bg-accent">
            <Clock className="mb-1 h-4 w-4 text-amber-400" /><p className="font-bold">{nextGame ? new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(nextGame.startTime) : 'All locked'}</p><p className="text-xs text-muted-foreground">next lock</p>
          </Link>
          <Link href="/notifications" className="rounded-lg bg-muted/50 p-3 hover:bg-accent"><Bell className="mb-1 h-4 w-4 text-blue-400" /><p className="font-bold">{unread}</p><p className="text-xs text-muted-foreground">unread alerts</p></Link>
          <Link href={`/profile/${userId}`} className="rounded-lg bg-muted/50 p-3 hover:bg-accent"><Swords className="mb-1 h-4 w-4 text-violet-400" /><p className="font-bold">{pendingBets}</p><p className="text-xs text-muted-foreground">pending challenges</p></Link>
        </div>
      </CardContent>
    </Card>
  );
}
