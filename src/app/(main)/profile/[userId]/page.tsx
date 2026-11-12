import { getUserStats } from '@/lib/scoring';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import PerformanceChart from '@/components/PerformanceChart';
import StreakBadge from '@/components/StreakBadge';
import AvatarUpload from '@/components/AvatarUpload';
import { Badge } from '@/components/ui/badge';
import { Trophy, Target, Percent, Flame, TrendingUp, Link as LinkIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import ApiKeySettings from '@/components/ApiKeySettings';
import FunStatsSection, { type FunStats } from '@/components/FunStatsSection';
import { ACHIEVEMENTS } from '@/lib/achievements';
import SideBetsSection from '@/components/SideBetsSection';
import SideBetChallengeButton from '@/components/SideBetChallengeButton';
import ProfilePreferences from '@/components/ProfilePreferences';
import { headers } from 'next/headers';

type H2HOpponent = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  wins: number;
  losses: number;
  ties: number;
  totalGames: number;
  rivalryScore: number;
  isRivalry: boolean;
};

type H2HAllResponse = {
  overall: { wins: number; losses: number; ties: number; totalSlates: number };
  allOpponents: H2HOpponent[];
};

type WeeklyScore = {
  id: string;
  weekId: string;
  points: number;
  finalRank: number | null;
  week: { weekNumber: number };
};

type PickEntry = {
  id: string;
  weekId: string;
  pickedTeam: string;
  isCorrect: boolean | null;
  pointsEarned: number | null;
};

type EarnedAchievement = {
  achievementId: string;
  earnedAt: string;
  slateId: string | null;
};

type AchievementsResponse = {
  earned: EarnedAchievement[];
  totalEarned: number;
};

type UserAwardsResponse = {
  total: number;
  byType: Record<string, number>;
};

const AWARD_DISPLAY: Record<string, { icon: string; label: string }> = {
  most_accurate:     { icon: '🎯', label: 'Most Accurate' },
  upset_specialist:  { icon: '💥', label: 'Upset Specialist' },
  on_fire:           { icon: '🔥', label: 'On Fire' },
  first_in:          { icon: '📅', label: 'First In' },
  tough_break:       { icon: '😬', label: 'Tough Break' },
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();
  const { userId } = await params;
  const cookie = (await headers()).get('cookie') ?? '';
  const [stats, funStatsRes, h2hRes, achievementsRes, awardsRes] = await Promise.all([
    getUserStats(userId, session?.user?.id ?? ''),
    fetch(
      `${process.env.NEXTAUTH_URL_INTERNAL}/api/users/${userId}/fun-stats`,
      { cache: 'no-store', headers: { cookie } },
    ).then((r) => r.ok ? (r.json() as Promise<FunStats>) : null).catch(() => null),
    fetch(
      `${process.env.NEXTAUTH_URL_INTERNAL}/api/users/${userId}/head-to-head`,
      { cache: 'no-store', headers: { cookie } },
    ).then((r) => r.ok ? (r.json() as Promise<H2HAllResponse>) : null).catch(() => null),
    fetch(
      `${process.env.NEXTAUTH_URL_INTERNAL}/api/users/${userId}/achievements`,
      { cache: 'no-store', headers: { cookie } },
    ).then((r) => r.ok ? (r.json() as Promise<AchievementsResponse>) : null).catch(() => null),
    fetch(
      `${process.env.NEXTAUTH_URL_INTERNAL}/api/users/${userId}/awards`,
      { cache: 'no-store', headers: { cookie } },
    ).then((r) => r.ok ? (r.json() as Promise<UserAwardsResponse>) : null).catch(() => null),
  ]);

  if (!stats) notFound();

  const funStats = funStatsRes ?? null;
  const isOwnProfile = session?.user?.id === userId;

  const earnedIds = new Set(achievementsRes?.earned.map((e) => e.achievementId) ?? []);
  const earnedMap = new Map(
    achievementsRes?.earned.map((e) => [e.achievementId, e]) ?? [],
  );

  const awardEntries = awardsRes
    ? Object.entries(awardsRes.byType).filter(([, count]) => count > 0)
    : [];

  const statCards = [
    { label: 'Total Points', value: stats.totalPoints, icon: Trophy, color: 'text-yellow-500' },
    { label: 'Best Week', value: stats.bestWeek, icon: TrendingUp, color: 'text-blue-500' },
    { label: 'Pick Accuracy', value: `${stats.pickPercentage}%`, icon: Percent, color: 'text-green-500' },
    { label: 'Current Streak', value: stats.currentStreak, icon: Flame, color: 'text-orange-500' },
    { label: 'Best Streak', value: stats.bestStreak, icon: Target, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-8">
      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <AvatarUpload
          userId={userId}
          displayName={stats.displayName}
          initialAvatarUrl={stats.avatarUrl}
          isOwnProfile={isOwnProfile}
          size="lg"
        />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black">{stats.displayName}</h1>
            {stats.currentStreak > 0 && <StreakBadge streak={stats.currentStreak} />}
          </div>
          <p className="text-muted-foreground mt-1">{stats.email}</p>
        </div>
        {session && !isOwnProfile && (
          <Link href={`/compare/${userId}`}>
            <Button variant="outline" size="sm" className="gap-2">
              <LinkIcon className="h-4 w-4" />
              Compare
            </Button>
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="glass-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className={`text-2xl font-black ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Awards Row */}
      {awardEntries.length > 0 && (
        <Card className="glass-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-muted-foreground">🏅 Awards:</span>
              {awardEntries.map(([type, count]) => {
                const display = AWARD_DISPLAY[type];
                if (!display) return null;
                return (
                  <Badge
                    key={type}
                    variant="secondary"
                    className="text-sm px-3 py-1"
                    title={display.label}
                  >
                    {display.icon}×{count}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Head-to-Head Records */}
      <div>
        <h2 className="text-xl font-bold mb-4">⚔️ Head-to-Head Records</h2>
        <Card className="glass-card border-border">
          <CardContent className="pt-4 pb-2">
            {!h2hRes || h2hRes.allOpponents.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No head-to-head data yet.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {h2hRes.allOpponents.slice(0, 10).map((opp) => {
                  const isWinning = opp.wins > opp.losses;
                  const isLosing = opp.losses > opp.wins;
                  return (
                    <a
                      key={opp.userId}
                      href={`/compare/${opp.userId}`}
                      className="flex items-center justify-between py-2.5 px-1 hover:bg-muted/50 rounded transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {opp.avatarUrl && <AvatarImage src={opp.avatarUrl} alt={opp.displayName} />}
                          <AvatarFallback className="text-xs">{opp.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{opp.displayName}</span>
                        {opp.isRivalry && <Badge className="bg-orange-500/20 text-orange-300">Rival</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${isWinning ? 'text-green-400' : isLosing ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {opp.wins}W – {opp.losses}L – {opp.ties}T
                        </span>
                        <span className="text-base">{isWinning ? '✅' : isLosing ? '❌' : '➖'}</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Achievements Shelf */}
      <div>
        <h2 className="text-xl font-bold mb-4">🏆 Achievements</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {ACHIEVEMENTS.map((achievement) => {
            const isEarned = earnedIds.has(achievement.id);
            const earned = earnedMap.get(achievement.id);
            return (
              <Card
                key={achievement.id}
                className={`glass-card border-border relative overflow-hidden transition-all ${
                  isEarned ? 'border-yellow-500/30' : 'opacity-50'
                }`}
              >
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="text-3xl mb-2">
                    {isEarned ? achievement.icon : '🔒'}
                  </div>
                  <p className={`text-xs font-bold leading-tight ${isEarned ? '' : 'text-muted-foreground'}`}>
                    {achievement.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-tight">
                    {achievement.description}
                  </p>
                  {isEarned && earned && (
                    <p className="text-xs text-yellow-400 mt-2 font-semibold">
                      {new Date(earned.earnedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Performance Chart */}
      <Card className="glass-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Performance Over Season</CardTitle>
        </CardHeader>
        <CardContent>
          <PerformanceChart data={stats.cumulativeData} displayName={stats.displayName} />
          <div className="flex items-center gap-4 mt-2 justify-center text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-6 bg-green-500 inline-block rounded" /> Cumulative
            </span>
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-6 bg-blue-500 inline-block" /> Weekly
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Pick History */}
      <div>
        <h2 className="text-xl font-bold mb-4">Pick History</h2>
        <div className="space-y-3">
          {(stats.weeklyScores as WeeklyScore[]).map((ws) => {
            const weekPicks = (stats.picks as PickEntry[]).filter((p) => p.weekId === ws.weekId);
            const correct = weekPicks.filter((p) => p.isCorrect === true).length;
            const total = weekPicks.filter((p) => p.isCorrect !== null).length;

            return (
              <Card key={ws.id} className="glass-card border-border">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">
                        Week {ws.week.weekNumber}
                      </span>
                      {ws.finalRank === 1 && (
                        <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-xs">
                          🥇 Winner
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {correct}/{total} correct
                      </span>
                      <span className="font-bold text-primary text-lg">
                        {ws.points} pts
                      </span>
                      {ws.finalRank && (
                        <span className="text-muted-foreground text-xs">
                          Rank #{ws.finalRank}
                        </span>
                      )}
                    </div>
                  </div>

                  {weekPicks.length > 0 && (
                    <>
                      <Separator className="my-2" />
                      <div className="flex flex-wrap gap-2">
                        {weekPicks.map((pick) => (
                          <span
                            key={pick.id}
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              pick.isCorrect === true
                                ? 'bg-green-500/20 text-green-400'
                                : pick.isCorrect === false
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-accent text-muted-foreground'
                            }`}
                          >
                            {pick.pickedTeam}
                            {pick.pointsEarned === 2 && ' ×2'}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {stats.weeklyScores.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No picks submitted yet
            </p>
          )}
        </div>
      </div>

      {/* Side Bets */}
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">🎲 Side Bets</h2>
        {session?.user?.id && session.user.id !== userId && (
          <SideBetChallengeButton
            opponentId={userId}
            opponentName={stats.displayName}
            sport="nfl"
          />
        )}
        <SideBetsSection
          userId={userId}
          currentUserId={session?.user?.id ?? null}
          sport="nfl"
        />
      </div>

      <FunStatsSection funStats={funStats} />

      {/* API Key Settings — only visible to the profile owner */}
      {isOwnProfile && (
        <div>
          <h2 className="text-xl font-bold mb-4">Settings</h2>
          <Card className="glass-card mb-4 border-border"><CardContent className="p-4"><ProfilePreferences /></CardContent></Card>
          <ApiKeySettings />
        </div>
      )}
    </div>
  );
}
