import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Calendar, CheckCircle, Gamepad2, BellRing, HeartPulse } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import SyncPanel from '@/components/admin/SyncPanel';

type DashWeek = {
  id: string;
  weekNumber: number;
  isFinal: boolean;
  _count: { games: number; picks: number };
};

export default async function AdminDashboard() {
  const [userCount, seasonData, pickCount] = await Promise.all([
    prisma.user.count(),
    prisma.season.findFirst({
      where: { isActive: true },
      include: {
        weeks: {
          include: { _count: { select: { picks: true, games: true } } },
          orderBy: { weekNumber: 'desc' },
        },
      },
    }),
    prisma.pick.count(),
  ]);

  const weekCount = seasonData?.weeks.length ?? 0;
  const gameCount = seasonData?.weeks.reduce((sum: number, w: { _count: { games: number } }) => sum + w._count.games, 0) ?? 0;

  const stats = [
    { label: 'Users', value: userCount, icon: Users, color: 'text-blue-500' },
    { label: 'Weeks', value: weekCount, icon: Calendar, color: 'text-green-500' },
    { label: 'Games', value: gameCount, icon: Gamepad2, color: 'text-yellow-500' },
    { label: 'Total Picks', value: pickCount, icon: CheckCircle, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2"><Link href="/admin/reminders"><Button><BellRing className="mr-2 h-4 w-4" />Reminder center</Button></Link><Link href="/admin/health"><Button variant="outline"><HeartPulse className="mr-2 h-4 w-4" />Application health</Button></Link></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="glass-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Icon className={`h-8 w-8 ${color}`} />
                <div>
                  <p className="text-2xl font-black">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <SyncPanel
        seasonYear={seasonData?.year}
        seasonType={seasonData?.seasonType}
      />

      {seasonData && (
        <Card className="glass-card border-border">
          <CardHeader>
            <CardTitle>Recent Weeks — {seasonData.year} Season</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(seasonData.weeks as DashWeek[]).slice(0, 5).map((week) => (
                <div key={week.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="font-semibold">Week {week.weekNumber}</span>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{week._count.games} games</span>
                    <span>{week._count.picks} picks</span>
                    {week.isFinal && (
                      <span className="text-green-400">Final</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
