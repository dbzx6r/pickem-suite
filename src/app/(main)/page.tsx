import { prisma } from '@/lib/prisma';
import { getLeaderboard } from '@/lib/scoring';
import LeaderboardTable from '@/components/LeaderboardTable';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import { auth } from '@/lib/auth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Calendar, ClipboardCheck } from 'lucide-react';
import ExportButton from '@/components/ExportButton';
import { seasonTitle } from '@/lib/season';
import MyWeekDashboard from '@/components/MyWeekDashboard';
import { getActiveWeek } from '@/lib/getActiveContext';
import { getLatestWeeklyWinner } from '@/lib/getWeeklyWinner';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await auth();

  const [entries, announcement, activeSeason, currentWeek, weeklyWinner] = await Promise.all([
    getLeaderboard(),
    prisma.announcement.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } }),
    prisma.season.findFirst({ where: { isActive: true, isSandbox: false } }),
    getActiveWeek(false),
    getLatestWeeklyWinner(false),
  ]);

  const weeklyScoresMap: Record<string, { points: number; rank: number | null }> = {};
  if (currentWeek) {
    for (const ws of currentWeek.weeklyScores) {
      weeklyScoresMap[ws.userId] = { points: ws.points, rank: ws.finalRank };
    }
  }

  const sortedEntries = [...entries].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div className="space-y-6">
      {session?.user?.id && session.user.role !== 'ADMIN' && <MyWeekDashboard userId={session.user.id} />}
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-black gradient-text">🏆 Leaderboard</h1>
          <p className="text-muted-foreground mt-1">
            {activeSeason
              ? `${seasonTitle(activeSeason.year, activeSeason.seasonType)}${currentWeek ? ` · Week ${currentWeek.weekNumber}` : ''}`
              : 'NFL Picks'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton isCommissioner={session?.user?.role === 'ADMIN'} />
          <Link href="/pick-status">
            <Button variant="outline" className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Pick Check
            </Button>
          </Link>
          <Link href="/picks">
            <Button className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Make Picks
            </Button>
          </Link>
        </div>
      </div>

      {announcement && <AnnouncementBanner message={announcement.message} />}

      <LeaderboardTable
        currentWeekId={currentWeek?.id}
        entries={sortedEntries}
        weeklyScoresMap={weeklyScoresMap}
        weeklyWinner={weeklyWinner}
      />
    </div>
  );
}
