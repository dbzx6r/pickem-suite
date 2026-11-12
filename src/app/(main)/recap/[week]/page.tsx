import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Target } from 'lucide-react';
import ShareRecapButton from '@/components/ShareRecapButton';
import OddsSummary from '@/components/OddsSummary';
import { bonusSpread, recordedPregameOdds } from '@/lib/pregame-odds';

export const dynamic = 'force-dynamic';

type RecapWeeklyScore = {
  id: string;
  userId: string;
  points: number;
  finalRank: number | null;
  tiebreakerUsed: boolean;
  randomTiebroken: boolean;
  adminOverridePoints: number | null;
  user: { email: string; profile: { displayName: string; avatarUrl: string | null } | null };
};

type RecapPick = {
  id: string;
  userId: string;
  pickedTeam: string;
  isCorrect: boolean | null;
  pointsEarned: number | null;
};

const AWARD_DISPLAY: Record<string, { icon: string; label: string }> = {
  most_accurate:     { icon: '🎯', label: 'Most Accurate' },
  upset_specialist:  { icon: '💥', label: 'Upset Specialist' },
  on_fire:           { icon: '🔥', label: 'On Fire' },
  first_in:          { icon: '📅', label: 'First In' },
  tough_break:       { icon: '😬', label: 'Tough Break' },
};

function formatAwardMeta(awardType: string, metadata: unknown): string {
  const meta = metadata as Record<string, unknown> | null;
  if (!meta) return '';
  switch (awardType) {
    case 'most_accurate':
      return `${Math.round(Number(meta.pct))}% accuracy (${meta.correct}/${meta.total})`;
    case 'upset_specialist':
      return `${meta.count} upset${Number(meta.count) !== 1 ? 's' : ''}`;
    case 'on_fire':
      return `${meta.picks} picks correct`;
    case 'first_in':
      return 'First to submit all picks';
    case 'tough_break':
      return `${Math.round(Number(meta.pct))}% accuracy, finished last`;
    default:
      return '';
  }
}

export default async function RecapPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week: weekParam } = await params;
  const weekNumber = parseInt(weekParam);

  const activeSeason = await prisma.season.findFirst({ where: { isActive: true } });
  if (!activeSeason) notFound();

  const week = await prisma.week.findFirst({
    where: { seasonId: activeSeason.id, weekNumber },
    include: {
      games: { orderBy: { startTime: 'asc' }, include: { oddsSnapshots: true } },
      weeklyScores: {
        include: { user: { include: { profile: true } } },
        orderBy: { finalRank: 'asc' },
      },
    },
  });

  if (!week || !week.recapVisible) notFound();
  const bonus = await prisma.auditLog.findUnique({ where: { id: `double-points:${week.id}` }, select: { details: true } });

  // Fetch picks and awards in parallel now that we have week.id
  const [picks, awards] = await Promise.all([
    prisma.pick.findMany({
      where: { weekId: week.id },
      include: { user: { include: { profile: true } }, game: true },
    }),
    prisma.slateAward.findMany({
      where: { weekId: week.id },
      include: { user: { include: { profile: true } } },
    }),
  ]);

  const winner = (week.weeklyScores as RecapWeeklyScore[])[0];
  const typedPicks = picks as RecapPick[];
  const gameStories = week.games.map((game) => {
    const gamePicks = picks.filter((pick) => pick.gameId === game.id);
    const winnerPicks = gamePicks.filter((pick) => pick.pickedTeam === game.winnerTeam);
    return {
      game,
      total: gamePicks.length,
      winnerCount: winnerPicks.length,
      winnerPct: gamePicks.length ? Math.round((winnerPicks.length / gamePicks.length) * 100) : 0,
      winnerNames: winnerPicks.map((pick) => pick.user.profile?.displayName ?? pick.user.email),
    };
  }).filter((story) => story.game.isFinal && story.total > 0).sort((a, b) => a.winnerPct - b.winnerPct || a.game.startTime.getTime() - b.game.startTime.getTime());
  const toughest = gameStories[0] ?? null;
  const contrarian = gameStories.find((story) => story.winnerCount === 1) ?? null;
  const finalGameCount = week.games.filter((game) => game.isFinal).length;
  const perfectEntries = week.weeklyScores.filter((score) => {
    const userFinalPicks = picks.filter((pick) => pick.userId === score.userId && pick.game.isFinal);
    return userFinalPicks.length === finalGameCount && userFinalPicks.every((pick) => pick.isCorrect === true);
  });
  const recapText = winner ? `Week ${weekNumber}: ${(winner as RecapWeeklyScore).user.profile?.displayName ?? (winner as RecapWeeklyScore).user.email} won with ${(winner as RecapWeeklyScore).adminOverridePoints ?? (winner as RecapWeeklyScore).points} points.${toughest ? ` Toughest result: ${toughest.game.winnerTeam} (${toughest.winnerPct}% picked).` : ''}` : `Week ${weekNumber} recap`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-3xl font-black gradient-text">Week {weekNumber} Recap</h1>
        {winner && (
          <p className="text-muted-foreground mt-2 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Winner: <span className="text-foreground font-semibold">
              {winner.user.profile?.displayName ?? winner.user.email}
            </span> with {winner.adminOverridePoints ?? winner.points} points
          </p>
        )}</div><ShareRecapButton title={`Week ${weekNumber} Recap`} text={recapText} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3"><Story label="Toughest result" value={toughest ? `${toughest.game.winnerTeam} won · ${toughest.winnerPct}% called it` : 'No final results'} detail={toughest ? `${toughest.game.awayTeam} at ${toughest.game.homeTeam}` : ''} /><Story label="Contrarian hit" value={contrarian ? `${contrarian.winnerNames[0]} stood alone on ${contrarian.game.winnerTeam}` : 'No solo winner this week'} detail={contrarian ? 'Only picker on the winning side' : ''} /><Story label="Perfect cards" value={`${perfectEntries.length}`} detail={perfectEntries.length ? perfectEntries.map((score) => score.user.profile?.displayName ?? score.user.email).join(', ') : 'Nobody swept the slate'} /></div>

      {/* Awards Section */}
      {awards.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">🏅 Awards</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {awards.map((award) => {
              const display = AWARD_DISPLAY[award.awardType];
              if (!display) return null;
              const displayName =
                award.user.profile?.displayName ?? award.user.email;
              const initials = displayName.slice(0, 2).toUpperCase();
              const meta = formatAwardMeta(award.awardType, award.metadata);
              return (
                <Card
                  key={award.id}
                  className="glass-card border-border border-yellow-500/20"
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{display.icon}</span>
                      <span className="font-bold text-sm">{display.label}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Avatar className="h-6 w-6">
                        {award.user.profile?.avatarUrl && (
                          <AvatarImage
                            src={award.user.profile.avatarUrl}
                            alt={displayName}
                          />
                        )}
                        <AvatarFallback className="text-xs bg-primary/20 text-primary">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-semibold truncate">
                        {displayName}
                      </span>
                    </div>
                    {meta && (
                      <p className="text-xs text-muted-foreground mt-1">{meta}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Final Scores */}
      <Card className="glass-card border-border">
        <CardHeader>
          <CardTitle>Final Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {week.games.map((game) => (
              <div key={game.id} className="py-3 border-b border-white/5 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{game.awayTeam}</span>
                  <span className="text-muted-foreground">@</span>
                  <span className="font-semibold">{game.homeTeam}</span>
                  {game.id === week.doubleGameId && (
                    <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-xs">2×</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {game.isFinal ? (
                    <span className="font-bold">
                      {game.awayScore} - {game.homeScore}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not final</span>
                  )}
                  {game.winnerTeam && (
                    <Badge variant="outline" className="text-xs">
                      {game.winnerTeam} wins
                    </Badge>
                  )}
                </div>
              </div>
              <OddsSummary {...game} {...recordedPregameOdds(game.startTime, game.oddsSnapshots)} bonusSelectionSpread={bonusSpread(bonus?.details, game.id)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rankings */}
      <div>
        <h2 className="text-xl font-bold mb-4">Final Rankings</h2>
        <div className="space-y-2">
          {(week.weeklyScores as RecapWeeklyScore[]).map((ws, i) => {
            const displayName = ws.user.profile?.displayName ?? ws.user.email;
            const initials = displayName.slice(0, 2).toUpperCase();
            const rank = ws.finalRank ?? i + 1;

            const userPicks = typedPicks.filter((p) => p.userId === ws.userId);
            const correct = userPicks.filter((p) => p.isCorrect === true).length;

            return (
              <Card key={ws.id} className={`glass-card border-border ${rank === 1 ? 'border-yellow-500/30' : ''}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">
                      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                    </span>
                    <Avatar className="h-8 w-8">
                      {ws.user.profile?.avatarUrl && (
                        <AvatarImage src={ws.user.profile.avatarUrl} alt={displayName} />
                      )}
                      <AvatarFallback className="text-xs font-bold bg-primary/20 text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <span className="font-semibold">{displayName}</span>
                      {ws.tiebreakerUsed && (
                        <Badge variant="outline" className="ml-2 text-xs">TB</Badge>
                      )}
                      {ws.randomTiebroken && (
                        <Badge variant="outline" className="ml-1 text-xs border-orange-500/50 text-orange-400">Stable draw</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {correct}/{week.games.filter((g) => g.isFinal).length}
                      </span>
                      <span className="font-bold text-primary text-lg">{ws.adminOverridePoints ?? ws.points} pts</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {userPicks.map((pick) => (
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Story({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="glass-card border-border"><CardContent className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-bold">{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</CardContent></Card>;
}
