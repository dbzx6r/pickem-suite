'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Activity, Radio, Swords, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type GameDayData = {
  week: { id: string; weekNumber: number; games: number } | null;
  standings: Array<{ userId: string; displayName: string; projectedTotal: number; securedWeekPoints: number; projectedWeekPoints: number; isCurrentUser: boolean; rank: number }>;
  scenarios: Array<{ gameId: string; matchup: string; status: string | null; clock: string | null; period: number | null; myPick: string | null; pointsAtStake: number; opposingNames: string[] }>;
  closestRival: { userId: string; displayName: string; projectedTotal: number; rank: number } | null;
  updatedAt: string;
};

const fetcher = (url: string) => fetch(url).then((response) => response.json());

export default function GameDayDashboard() {
  const { data, error, isLoading } = useSWR<GameDayData>('/api/game-day', fetcher, { refreshInterval: 20_000, revalidateOnFocus: true });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading Game Day…</p>;
  if (error || !data) return <p className="text-sm text-red-400">Game Day could not refresh.</p>;
  if (!data.week) return <p className="text-sm text-muted-foreground">No active slate is available.</p>;
  const me = data.standings.find((entry) => entry.isCurrentUser);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Radio className="h-5 w-5 text-red-400" /><h1 className="text-3xl font-black gradient-text">Game Day</h1></div><p className="text-sm text-muted-foreground">Week {data.week.weekNumber} · live projections refresh every 20 seconds</p></div><Link href={`/picks/${data.week.weekNumber}`}><Button variant="outline">Open picks</Button></Link></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric icon={<Trophy className="h-4 w-4" />} label="Projected rank" value={me ? `#${me.rank}` : '—'} />
      <Metric icon={<Activity className="h-4 w-4" />} label="Week points" value={me ? `${me.securedWeekPoints} secured · ${me.projectedWeekPoints} live` : '—'} />
      <Metric icon={<Swords className="h-4 w-4" />} label="Closest rival" value={data.closestRival ? `${data.closestRival.displayName} · #${data.closestRival.rank}` : '—'} />
    </div>
    <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <Card className="glass-card border-border"><CardHeader><CardTitle>Live standings</CardTitle></CardHeader><CardContent className="space-y-2">{data.standings.map((entry) => <div key={entry.userId} className={`flex items-center justify-between rounded-lg border p-3 ${entry.isCurrentUser ? 'border-primary/50 bg-primary/10' : 'border-border'}`}><div><span className="mr-3 font-black">#{entry.rank}</span><span className="font-semibold">{entry.displayName}</span>{entry.isCurrentUser && <Badge className="ml-2">You</Badge>}</div><div className="text-right"><p className="font-black">{entry.projectedTotal}</p><p className="text-[10px] text-muted-foreground">projected total</p></div></div>)}</CardContent></Card>
      <Card className="glass-card border-border"><CardHeader><CardTitle>What I need to happen</CardTitle></CardHeader><CardContent className="space-y-3">{data.scenarios.length === 0 ? <p className="text-sm text-muted-foreground">Scenarios appear when games kick off. Unrevealed picks stay private.</p> : data.scenarios.map((scenario) => <div key={scenario.gameId} className="rounded-lg border border-border p-3"><div className="flex justify-between gap-2"><p className="font-semibold">{scenario.matchup}</p><Badge variant="outline">{scenario.clock || scenario.status || 'Live'}</Badge></div>{scenario.myPick ? <><p className="mt-2 text-sm">You need <b className="text-primary">{scenario.myPick}</b> for {scenario.pointsAtStake} point{scenario.pointsAtStake === 1 ? '' : 's'}.</p><p className="mt-1 text-xs text-muted-foreground">Swing against {scenario.opposingNames.length ? scenario.opposingNames.join(', ') : 'no one on the other side'}.</p></> : <p className="mt-2 text-sm text-amber-300">No pick was saved before kickoff.</p>}</div>)}</CardContent></Card>
    </div>
  </div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card className="glass-card border-border"><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div><p className="mt-1 text-xl font-black">{value}</p></CardContent></Card>;
}

