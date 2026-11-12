import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { seasonTitle } from '@/lib/season';

export const dynamic = 'force-dynamic';

export default async function RecordsPage() {
  const seasons = await prisma.season.findMany({ where: { isSandbox: false }, orderBy: [{ year: 'desc' }, { seasonType: 'desc' }], include: { weeks: { include: { weeklyScores: { include: { user: { include: { profile: true } } } }, tiebreakers: { include: { user: { include: { profile: true } } } } } } } });
  const weekly = seasons.flatMap((season) =>
    season.weeks.flatMap((week) =>
      week.weeklyScores.map((score) => ({ ...score, week, season })),
    ),
  );
  const highest = weekly.sort((a, b) => b.points - a.points)[0];
  const wins = new Map<string, { name: string; count: number }>();
  for (const score of weekly.filter((item) => item.finalRank === 1)) { const item = wins.get(score.userId) ?? { name: score.user.profile?.displayName ?? score.user.email, count: 0 }; item.count++; wins.set(score.userId, item); }
  const mostWins = [...wins.values()].sort((a, b) => b.count - a.count)[0];
  const closest = seasons.flatMap((season) => season.weeks.flatMap((week) => week.tiebreakers.filter((tb) => tb.difference != null).map((tb) => ({ ...tb, season, week })))).sort((a, b) => (a.difference ?? 999) - (b.difference ?? 999))[0];
  return <div className="space-y-6"><div><h1 className="text-3xl font-black gradient-text">League Records & Archive</h1><p className="text-muted-foreground">Career records and preserved season results.</p></div><div className="grid gap-3 sm:grid-cols-3"><Record label="Highest weekly score" value={highest ? `${highest.points} pts · ${highest.user.profile?.displayName ?? highest.user.email}` : '—'} /><Record label="Most weekly wins" value={mostWins ? `${mostWins.count} · ${mostWins.name}` : '—'} /><Record label="Closest tiebreaker" value={closest ? `${closest.difference} away · ${closest.user.profile?.displayName ?? closest.user.email}` : '—'} /></div><div className="space-y-3">{seasons.map((season) => { const totals = new Map<string, { name: string; points: number }>(); for (const week of season.weeks) for (const score of week.weeklyScores) { const current = totals.get(score.userId) ?? { name: score.user.profile?.displayName ?? score.user.email, points: 0 }; current.points += score.points; totals.set(score.userId, current); } const standings = [...totals.values()].sort((a, b) => b.points - a.points); return <Card key={season.id} className="glass-card border-border"><CardContent className="p-4"><h2 className="text-lg font-bold">{seasonTitle(season.year, season.seasonType)}</h2><p className="text-sm text-muted-foreground">{season.weeks.length} weeks · {season.isActive ? 'Active' : 'Archived'}</p>{standings.length > 0 && <div className="mt-3 grid gap-1 text-sm">{standings.slice(0, 5).map((entry, index) => <div key={entry.name} className="flex justify-between"><span>#{index + 1} {entry.name}</span><span className="font-bold">{entry.points} pts</span></div>)}</div>}</CardContent></Card>; })}</div></div>;
}
function Record({ label, value }: { label: string; value: string }) { return <Card className="glass-card border-primary/20"><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 font-black">{value}</p></CardContent></Card>; }
