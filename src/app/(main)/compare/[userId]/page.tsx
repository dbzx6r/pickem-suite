import { getUserStats } from '@/lib/scoring';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { headers } from 'next/headers';
import SideBetChallengeButton from '@/components/SideBetChallengeButton';

type CumulativeEntry = { week: number; points: number; cumulative: number; rank: number | null };

type H2HOverallResponse = {
  overall: { wins: number; losses: number; ties: number; totalSlates: number };
  opponent?: { pointMargin: number; isRivalry: boolean; currentStreak: { result: 'win' | 'loss' | 'tie' | null; count: number } };
};

export default async function ComparePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  const { userId } = await params;
  const cookie = (await headers()).get('cookie') ?? '';

  const [myStats, theirStats, h2hRes] = await Promise.all([
    getUserStats(session.user.id as string, session.user.id as string),
    getUserStats(userId, session.user.id as string),
    fetch(
      `${process.env.NEXTAUTH_URL_INTERNAL}/api/users/${session.user.id}/head-to-head?opponentId=${userId}`,
      { cache: 'no-store', headers: { cookie } },
    ).then((r) => r.ok ? (r.json() as Promise<H2HOverallResponse>) : null).catch(() => null),
  ]);

  if (!myStats || !theirStats) notFound();

  const myInitials = myStats.displayName.slice(0, 2).toUpperCase();
  const theirInitials = theirStats.displayName.slice(0, 2).toUpperCase();

  const categories = [
    { label: 'Total Points', myVal: myStats.totalPoints, theirVal: theirStats.totalPoints },
    { label: 'Best Week', myVal: myStats.bestWeek, theirVal: theirStats.bestWeek },
    { label: 'Pick Accuracy', myVal: myStats.pickPercentage, theirVal: theirStats.pickPercentage, suffix: '%' },
    { label: 'Current Streak', myVal: myStats.currentStreak, theirVal: theirStats.currentStreak },
    { label: 'Best Streak', myVal: myStats.bestStreak, theirVal: theirStats.bestStreak },
  ];

  // Week-by-week comparison
  const myCD = myStats.cumulativeData as CumulativeEntry[];
  const theirCD = theirStats.cumulativeData as CumulativeEntry[];
  const allWeeks = myCD.map((d) => d.week).concat(theirCD.map((d) => d.week));
  const weeks = (Array.from(new Set(allWeeks)) as number[]).sort((a, b) => a - b);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black gradient-text">Head to Head</h1>
        <SideBetChallengeButton opponentId={userId} opponentName={theirStats.displayName} sport="nfl" />
      </div>

      {/* H2H Record Banner */}
      {(() => {
        const total = h2hRes?.overall.totalSlates ?? 0;
        const wins = h2hRes?.overall.wins ?? 0;
        const losses = h2hRes?.overall.losses ?? 0;
        const ties = h2hRes?.overall.ties ?? 0;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        return (
          <Card className="glass-card border-border bg-gradient-to-r from-blue-500/10 to-red-500/10">
            <CardContent className="py-4 text-center space-y-2">
              <div className="font-bold text-lg">⚔️ You vs {theirStats.displayName}</div>
              {total > 0 ? (
                <>
                  <div className="flex justify-center gap-4 text-sm">
                    <span className="text-green-400 font-bold">{wins} Wins</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-red-400 font-bold">{losses} Losses</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-bold">{ties} Ties</span>
                  </div>
                  <div className="max-w-xs mx-auto">
                    <div className="flex h-2 rounded-full overflow-hidden bg-accent">
                      <div className="bg-green-500 transition-all" style={{ width: `${winRate}%` }} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{winRate}% win rate</div>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 text-xs"><Badge variant="outline">Point margin {h2hRes?.opponent?.pointMargin && h2hRes.opponent.pointMargin > 0 ? '+' : ''}{h2hRes?.opponent?.pointMargin ?? 0}</Badge>{h2hRes?.opponent?.isRivalry && <Badge className="bg-orange-500/20 text-orange-300">Official rivalry</Badge>}{h2hRes?.opponent?.currentStreak?.count ? <Badge variant="outline">{h2hRes.opponent.currentStreak.count}-week {h2hRes.opponent.currentStreak.result} streak</Badge> : null}</div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No games played yet.</div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Player Headers */}
      <div className="grid grid-cols-3 items-center gap-4">
        <div className="flex flex-col items-center gap-2">
          <Avatar className="h-16 w-16">
            {myStats.avatarUrl && <AvatarImage src={myStats.avatarUrl} alt={myStats.displayName} />}
            <AvatarFallback className="bg-blue-500/20 text-blue-400 text-xl font-black">
              {myInitials}
            </AvatarFallback>
          </Avatar>
          <span className="font-bold text-center">{myStats.displayName}</span>
          <Badge variant="outline" className="text-xs">You</Badge>
        </div>
        <div className="text-center text-2xl font-black text-muted-foreground">VS</div>
        <div className="flex flex-col items-center gap-2">
          <Avatar className="h-16 w-16">
            {theirStats.avatarUrl && <AvatarImage src={theirStats.avatarUrl} alt={theirStats.displayName} />}
            <AvatarFallback className="bg-red-500/20 text-red-400 text-xl font-black">
              {theirInitials}
            </AvatarFallback>
          </Avatar>
          <span className="font-bold text-center">{theirStats.displayName}</span>
        </div>
      </div>

      {/* Stats Comparison */}
      <div className="space-y-3">
        {categories.map(({ label, myVal, theirVal, suffix = '' }) => {
          const myWins = myVal > theirVal;
          const tied = myVal === theirVal;

          return (
            <Card key={label} className="glass-card border-border">
              <CardContent className="py-3 px-4">
                <div className="text-xs text-muted-foreground text-center mb-2">{label}</div>
                <div className="grid grid-cols-3 items-center">
                  <div className={`text-center text-2xl font-black ${myWins ? 'text-green-400' : tied ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {myVal}{suffix}
                  </div>
                  <div className="text-center text-muted-foreground text-sm">
                    {myWins ? '←' : theirVal > myVal ? '→' : '—'}
                  </div>
                  <div className={`text-center text-2xl font-black ${!myWins && !tied ? 'text-green-400' : tied ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {theirVal}{suffix}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Week by Week */}
      <Card className="glass-card border-border">
        <CardHeader>
          <CardTitle>Week by Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {weeks.map((week) => {
              const myWeek = myCD.find((d) => d.week === week);
              const theirWeek = theirCD.find((d) => d.week === week);
              const myPts = myWeek?.points ?? 0;
              const theirPts = theirWeek?.points ?? 0;

              return (
                <div key={week} className="grid grid-cols-5 items-center gap-2 text-sm">
                  <div className={`text-right font-bold ${myPts > theirPts ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {myPts}
                  </div>
                  <div className="col-span-3">
                    <div className="flex h-2 rounded-full overflow-hidden bg-muted/50">
                      <div
                        className={`transition-all ${myPts >= theirPts ? 'bg-blue-500' : 'bg-blue-500/50'}`}
                        style={{ width: `${myPts > 0 || theirPts > 0 ? (myPts / (myPts + theirPts)) * 100 : 50}%` }}
                      />
                      <div
                        className={`flex-1 ${theirPts > myPts ? 'bg-red-500' : 'bg-red-500/50'}`}
                      />
                    </div>
                    <div className="text-center text-xs text-muted-foreground mt-0.5">Week {week}</div>
                  </div>
                  <div className={`text-left font-bold ${theirPts > myPts ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {theirPts}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
