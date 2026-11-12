import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function CalendarPage() {
  const session = await auth();
  const [season, favorite] = await Promise.all([
    prisma.season.findFirst({ where: { isActive: true, isSandbox: false }, include: { weeks: { orderBy: { weekNumber: 'asc' }, include: { games: { orderBy: { startTime: 'asc' } } } } } }),
    session?.user?.id ? prisma.user.findUnique({ where: { id: session.user.id }, select: { profile: { select: { favoriteTeam: true } } } }) : null,
  ]);
  const games = season?.weeks.flatMap((week) => week.games.map((game) => ({ ...game, weekNumber: week.weekNumber }))) ?? [];
  const grouped = new Map<string, typeof games>();
  for (const game of games) { const key = game.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); grouped.set(key, [...(grouped.get(key) ?? []), game]); }
  return <div className="space-y-5"><div><h1 className="text-2xl font-black gradient-text sm:text-3xl">Game Calendar</h1><p className="text-muted-foreground">Every scheduled game grouped by local date. Each selection locks at kickoff.</p></div>{[...grouped.entries()].map(([date, dayGames]) => <section key={date}><h2 className="mb-2 text-lg font-bold">{date}</h2><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{dayGames.map((game) => { const favored = favorite?.profile?.favoriteTeam && [game.homeTeam, game.awayTeam].includes(favorite.profile.favoriteTeam); const locked = game.startTime <= new Date(); return <Link key={game.id} href={`/picks/${game.weekNumber}`} className="min-w-0"><Card className={`glass-card h-full min-w-0 ${favored ? 'border-primary/40' : 'border-border'}`}><CardContent className="p-3"><div className="flex min-w-0 items-start justify-between gap-2"><span className="min-w-0 break-words font-bold">{game.awayTeam} @ {game.homeTeam}</span><Badge className="shrink-0" variant="outline">{game.isFinal ? 'Final' : locked ? 'Locked' : 'Open'}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Week {game.weekNumber} · {game.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p></CardContent></Card></Link>; })}</div></section>)}{games.length === 0 && <p>No schedule is available.</p>}</div>;
}
