'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import TeamLogo from '@/components/TeamLogo';
import { NFL_TEAMS } from '@/lib/espn';
import { cn } from '@/lib/utils';
import LiveGamecast from '@/components/LiveGamecast';
import OddsSummary from '@/components/OddsSummary';
import { LivePlayerCategory, LiveTeamStat } from '@/lib/live-game-stats';

export interface GameCardData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  homeScoreQ1: number | null;
  homeScoreQ2: number | null;
  homeScoreQ3: number | null;
  homeScoreQ4: number | null;
  awayScoreQ1: number | null;
  awayScoreQ2: number | null;
  awayScoreQ3: number | null;
  awayScoreQ4: number | null;
  winnerTeam: string | null;
  startTime: string | Date;
  isFinal: boolean;
  period: number | null;
  clock: string | null;
  possession: string | null;
  downDistance: string | null;
  shortDownDistance?: string | null;
  possessionText?: string | null;
  yardLine?: number | null;
  distance?: number | null;
  isRedZone?: boolean;
  lastPlayText?: string | null;
  driveSummary?: string | null;
  teamStats?: LiveTeamStat[] | null;
  boxScore?: LivePlayerCategory[] | null;
  homeTimeOfPossession: string | null;
  awayTimeOfPossession: string | null;
  statusState: string | null;
  pickLocked?: boolean;
  isDoubleGame?: boolean;
  userPick?: string | null;
  pickIsCorrect?: boolean | null;
  venue?: string | null;
  spreadLine?: string | null;
  overUnder?: number | null;
  homeRecord?: string | null;
  awayRecord?: string | null;
  weather?: string | null;
  broadcast?: string | null;
  oddsProvider?: string | null;
  bonusSelectionSpread?: string | null;
  oddsSnapshots?: Array<{ spreadLine: string | null; capturedAt: string | Date }>;
  injurySummary?: Array<{ team: string; player: string; position: string | null; status: string }> | null;
}

interface GameCardProps {
  game: GameCardData;
  onPick?: (team: string) => void;
  isLocked?: boolean;
  showPickButtons?: boolean;
  showGamecast?: boolean;
}

function parseTOP(top: string | null): number {
  if (!top) return 0;
  const parts = top.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}

export default function GameCard({ game, onPick, isLocked, showPickButtons, showGamecast }: GameCardProps) {
  const homeTeam = NFL_TEAMS[game.homeTeam];
  const awayTeam = NFL_TEAMS[game.awayTeam];
  const isLive = game.statusState === 'in';
  const isPre = game.statusState === 'pre';
  const isFinal = game.statusState === 'post';
  const isPostponed = game.statusState === 'postponed';
  const isCanceled = game.statusState === 'canceled';
  const isSuspended = game.statusState === 'suspended';

  const homeTop = parseTOP(game.homeTimeOfPossession);
  const awayTop = parseTOP(game.awayTimeOfPossession);
  const totalTop = homeTop + awayTop;
  const homeTopPct = totalTop > 0 ? Math.round((homeTop / totalTop) * 100) : 50;

  const quarterLabel = game.period
    ? game.period <= 4
      ? `Q${game.period}`
      : 'OT'
    : null;

  const hasScores = game.homeScoreQ1 !== null || (isLive && game.homeScore !== null);

  const getPickStyle = (team: string) => {
    if (!game.userPick) return '';
    if (game.userPick !== team) return 'opacity-40';
    if (game.pickIsCorrect === true) return 'picked-correct ring-2 ring-green-500/50';
    if (game.pickIsCorrect === false) return 'picked-wrong ring-2 ring-red-500/50';
    return 'ring-2 ring-emerald-400 bg-emerald-400/20';
  };

  const startTimeFormatted = new Date(game.startTime).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'glass-card relative overflow-hidden p-4',
        game.isDoubleGame && 'ring-2 ring-yellow-500/50'
      )}
    >
      {/* Double game ribbon */}
      {game.isDoubleGame && (
        <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[10px] font-black px-2 py-0.5 rounded-bl-lg">
          2× BONUS
        </div>
      )}

      {/* Status badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400 font-semibold">LIVE</span>
              {quarterLabel && (
                <Badge variant="outline" className="text-xs border-red-500/50 text-red-400 py-0">
                  {quarterLabel}
                </Badge>
              )}
              {game.clock && (
                <span className="text-xs text-muted-foreground font-mono">{game.clock}</span>
              )}
            </span>
          )}
          {isFinal && !isLive && (
            <Badge variant="outline" className="text-xs border-green-500/50 text-green-400 py-0">
              FINAL
            </Badge>
          )}
          {isPostponed && (
            <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-400 py-0">
              Postponed
            </Badge>
          )}
          {isCanceled && (
            <Badge variant="outline" className="text-xs border-red-500/50 text-red-400 py-0">
              CANCELED
            </Badge>
          )}
          {isSuspended && (
            <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-400 py-0">
              SUSPENDED
            </Badge>
          )}
          {isPre && (
            <span className="text-xs text-muted-foreground">{startTimeFormatted}</span>
          )}
        </div>
        {game.downDistance && isLive && !showGamecast && (
          <span className="text-xs text-muted-foreground">{game.downDistance}</span>
        )}
      </div>

      {/* Teams and Scores */}
      {isFinal && game.homeScore !== null && game.awayScore !== null && game.homeScore === game.awayScore && (
        <p className="mb-2 text-xs text-muted-foreground">Final tie · either team picked earns 1 point.</p>
      )}
      <div className="grid grid-cols-3 items-center gap-2 mb-3">
        {/* Away Team */}
        <button
          disabled={isLocked || !showPickButtons}
          onClick={() => onPick?.(game.awayTeam)}
          className={cn(
            'flex flex-col items-center gap-1 p-2 rounded-lg transition-all',
            showPickButtons && !isLocked && 'hover:bg-accent cursor-pointer active:scale-95',
            getPickStyle(game.awayTeam)
          )}
        >
          <div className="relative">
            <TeamLogo abbreviation={game.awayTeam} size={40} />
            {isLive && game.possession === game.awayTeam && (
              <span className="absolute -top-1 -right-1 football-live text-sm">🏈</span>
            )}
          </div>
          <span className="text-xs font-semibold">{game.awayTeam}</span>
          {game.awayRecord && <span className="text-[10px] text-muted-foreground">{game.awayRecord}</span>}
          {awayTeam && (
            <span className="text-[10px] text-muted-foreground text-center leading-tight">
              {awayTeam.city}
            </span>
          )}
          {game.userPick === game.awayTeam && (
            <span className="text-[10px] font-bold">
              {game.pickIsCorrect === true ? '✅' : game.pickIsCorrect === false ? '❌' : '✓ PICK'}
            </span>
          )}
        </button>

        {/* Score */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2 text-2xl font-black tabular-nums">
            <span className={cn(
              game.winnerTeam === game.awayTeam && isFinal && 'text-foreground',
              game.winnerTeam !== game.awayTeam && isFinal && 'text-muted-foreground'
            )}>
              {game.awayScore ?? (isLive ? '0' : '-')}
            </span>
            <span className="text-muted-foreground text-lg">:</span>
            <span className={cn(
              game.winnerTeam === game.homeTeam && isFinal && 'text-foreground',
              game.winnerTeam !== game.homeTeam && isFinal && 'text-muted-foreground'
            )}>
              {game.homeScore ?? (isLive ? '0' : '-')}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">@</span>
        </div>

        {/* Home Team */}
        <button
          disabled={isLocked || !showPickButtons}
          onClick={() => onPick?.(game.homeTeam)}
          className={cn(
            'flex flex-col items-center gap-1 p-2 rounded-lg transition-all',
            showPickButtons && !isLocked && 'hover:bg-accent cursor-pointer active:scale-95',
            getPickStyle(game.homeTeam)
          )}
        >
          <div className="relative">
            <TeamLogo abbreviation={game.homeTeam} size={40} />
            {isLive && game.possession === game.homeTeam && (
              <span className="absolute -top-1 -right-1 football-live text-sm">🏈</span>
            )}
          </div>
          <span className="text-xs font-semibold">{game.homeTeam}</span>
          {game.homeRecord && <span className="text-[10px] text-muted-foreground">{game.homeRecord}</span>}
          {homeTeam && (
            <span className="text-[10px] text-muted-foreground text-center leading-tight">
              {homeTeam.city}
            </span>
          )}
          {game.userPick === game.homeTeam && (
            <span className="text-[10px] font-bold">
              {game.pickIsCorrect === true ? '✅' : game.pickIsCorrect === false ? '❌' : '✓ PICK'}
            </span>
          )}
        </button>
      </div>

      {(isLive || isFinal) && showGamecast && (
        <LiveGamecast
          isFinal={isFinal}
          awayTeam={game.awayTeam}
          homeTeam={game.homeTeam}
          possession={game.possession}
          downDistance={game.downDistance}
          shortDownDistance={game.shortDownDistance ?? null}
          possessionText={game.possessionText ?? null}
          yardLine={game.yardLine ?? null}
          distance={game.distance ?? null}
          isRedZone={game.isRedZone ?? false}
          driveSummary={game.driveSummary ?? null}
          lastPlayText={game.lastPlayText ?? null}
          awayScore={game.awayScore}
          homeScore={game.homeScore}
          awayScoreQ1={game.awayScoreQ1}
          awayScoreQ2={game.awayScoreQ2}
          awayScoreQ3={game.awayScoreQ3}
          awayScoreQ4={game.awayScoreQ4}
          homeScoreQ1={game.homeScoreQ1}
          homeScoreQ2={game.homeScoreQ2}
          homeScoreQ3={game.homeScoreQ3}
          homeScoreQ4={game.homeScoreQ4}
          teamStats={game.teamStats ?? []}
          boxScore={game.boxScore ?? []}
        />
      )}

      {/* Quarter scores */}
      {hasScores && !showGamecast && (
        <div className="mt-2 mb-3">
          <table className="w-full text-xs text-center text-muted-foreground">
            <thead>
              <tr>
                <th className="text-left pb-1"></th>
                <th className="pb-1">Q1</th>
                <th className="pb-1">Q2</th>
                <th className="pb-1">Q3</th>
                <th className="pb-1">Q4</th>
                <th className="pb-1 font-bold text-foreground">T</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-left text-foreground font-semibold">{game.awayTeam}</td>
                <td>{game.awayScoreQ1 ?? '-'}</td>
                <td>{game.awayScoreQ2 ?? '-'}</td>
                <td>{game.awayScoreQ3 ?? '-'}</td>
                <td>{game.awayScoreQ4 ?? '-'}</td>
                <td className="font-bold text-foreground">{game.awayScore ?? '-'}</td>
              </tr>
              <tr>
                <td className="text-left text-foreground font-semibold">{game.homeTeam}</td>
                <td>{game.homeScoreQ1 ?? '-'}</td>
                <td>{game.homeScoreQ2 ?? '-'}</td>
                <td>{game.homeScoreQ3 ?? '-'}</td>
                <td>{game.homeScoreQ4 ?? '-'}</td>
                <td className="font-bold text-foreground">{game.homeScore ?? '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Time of possession */}
      {(isLive || isFinal) && !showGamecast && totalTop > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>{game.awayTeam} {game.awayTimeOfPossession}</span>
            <span className="text-center">Possession</span>
            <span>{game.homeTimeOfPossession} {game.homeTeam}</span>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-accent">
            <div
              className="bg-blue-500 transition-all duration-500"
              style={{ width: `${100 - homeTopPct}%` }}
            />
            <div
              className="bg-red-500 transition-all duration-500"
              style={{ width: `${homeTopPct}%` }}
            />
          </div>
        </div>
      )}
      {/* Venue + odds */}
      {game.venue && (
        <div className="text-[10px] text-muted-foreground text-center mt-1 mb-1">
          📍 {game.venue}
        </div>
      )}
      {isPre && (game.weather || game.broadcast) && <div className="flex flex-wrap justify-center gap-3 text-[10px] text-muted-foreground"><span>{game.weather ? `Weather: ${game.weather}` : ''}</span><span>{game.broadcast ? `TV: ${game.broadcast}` : ''}</span></div>}
      {isPre && game.injurySummary && game.injurySummary.length > 0 && <details className="mt-2 rounded border border-border p-2 text-[10px]"><summary className="cursor-pointer font-semibold text-muted-foreground">Injury report ({game.injurySummary.length})</summary><div className="mt-1 space-y-1">{game.injurySummary.slice(0, 6).map((injury, index) => <p key={`${injury.team}-${injury.player}-${index}`}><b>{injury.team}</b> · {injury.player}{injury.position ? ` (${injury.position})` : ''} · {injury.status}</p>)}</div><p className="mt-1 text-muted-foreground">Source: ESPN game summary</p></details>}
      <OddsSummary {...game} isFinal={isFinal} isPregame={isPre} />
      {isPre && game.spreadLine && game.oddsSnapshots?.[0]?.spreadLine && game.oddsSnapshots[0].spreadLine !== game.spreadLine && <p className="mt-1 text-center text-[9px] text-amber-300">Line moved from {game.oddsSnapshots[0].spreadLine} to {game.spreadLine}</p>}
    </motion.div>
  );
}
