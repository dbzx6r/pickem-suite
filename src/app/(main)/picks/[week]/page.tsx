'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import GameCard, { GameCardData } from '@/components/GameCard';
import PickDistribution from '@/components/PickDistribution';
import CountdownTimer from '@/components/CountdownTimer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clipboard, Loader2, Trophy } from 'lucide-react';
import { isSandboxModeClient } from '@/lib/sandboxContext';
import { gameIsOpen } from '@/lib/game-availability';
import { tiebreakerValidationError } from '@/lib/pick-validation';
import WeekNavigator from '@/components/WeekNavigator';

interface WeekData {
  id: string;
  weekNumber: number;
  lockTime: string;
  doubleGameId: string | null;
  tiebreakerGameId: string | null;
  isFinal: boolean;
  season?: {
    seasonType: string;
    isSandbox?: boolean;
  };
  pickWindowOpen: boolean;
  scheduleUpdatedAt?: string | null;
}

interface UserPick {
  gameId: string;
  pickedTeam: string;
  isCorrect: boolean | null;
  pointsEarned: number;
}

export default function WeekPicksPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const weekNumber = parseInt(params.week as string);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && session!.user?.role === 'ADMIN' && !isSandboxModeClient()) router.replace('/admin');
  }, [status, router, session]);

  const [week, setWeek] = useState<WeekData | null>(null);
  const [games, setGames] = useState<GameCardData[]>([]);
  const [userPicks, setUserPicks] = useState<Record<string, UserPick>>({});
  const [tiebreakerValue, setTiebreakerValue] = useState('');
  const [savedTiebreaker, setSavedTiebreaker] = useState<number | null>(null);
  const [tiebreakerSaveStatus, setTiebreakerSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [tiebreakerSaveError, setTiebreakerSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPick, setSavingPick] = useState<string | null>(null);
  const [isQueued, setIsQueued] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [receipt, setReceipt] = useState<{ lastSavedAt: string | null; revisionCount: number }>({ lastSavedAt: null, revisionCount: 0 });
  const pendingTiebreakerRef = useRef<number | null>(null);
  const tiebreakerSaveInFlightRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    // Initial fetch without week.id
    const init = async () => {
      try {
        const gamesRes = await fetch(`/api/games/live?week=${weekNumber}`);
        const gamesData = await gamesRes.json();
        
        if (gamesData.week) {
          setWeek(gamesData.week);
          const hasFutureGame = (gamesData.games || []).some(
            (game: GameCardData) => gameIsOpen(game),
          );
          setIsQueued(!gamesData.week.pickWindowOpen && hasFutureGame);

          // Fetch picks with week id
          const picksRes = await fetch(`/api/picks?weekId=${gamesData.week.id}`);
          if (picksRes.ok) {
            const picksData = await picksRes.json();
            const picksMap: Record<string, UserPick> = {};
            for (const pick of picksData.picks || []) {
              picksMap[pick.gameId] = pick;
            }
            setUserPicks(picksMap);
            if (picksData.tiebreaker) {
              setSavedTiebreaker(picksData.tiebreaker.guessedTotal);
              setTiebreakerValue(String(picksData.tiebreaker.guessedTotal));
              setTiebreakerSaveStatus('saved');
            }
            if (picksData.receipt) setReceipt(picksData.receipt);
          }
        }

        if (gamesData.games) setGames(gamesData.games);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [weekNumber]);

  // Live polling
  useEffect(() => {
    if (!week) return;
    const hasLive = games.some((g) => g.statusState === 'in');
    const interval = week.season?.isSandbox || hasLive ? 15_000 : 5 * 60_000;

    const timer = setInterval(async () => {
      const res = await fetch(`/api/games/live?week=${weekNumber}`);
      const data = await res.json();
      if (data.games) setGames(data.games);
      if (data.week) {
        setWeek(data.week);
        const hasFutureGame = (data.games || []).some(
          (game: GameCardData) => gameIsOpen(game),
        );
        setIsQueued(!data.week.pickWindowOpen && hasFutureGame);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [week, games, weekNumber]);

  const handlePick = async (gameId: string, team: string) => {
    const game = games.find((candidate) => candidate.id === gameId);
    if (!week || !game || isQueued || !gameIsOpen(game)) return;
    setSavingPick(gameId);
    const previousPick = userPicks[gameId];

    // Optimistic update
    setUserPicks((prev) => ({
      ...prev,
      [gameId]: { gameId, pickedTeam: team, isCorrect: null, pointsEarned: 0 },
    }));

    try {
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, pickedTeam: team, weekId: week.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to save pick');
        setUserPicks((prev) => { const copy = { ...prev }; if (previousPick) copy[gameId] = previousPick; else delete copy[gameId]; return copy; });
      } else {
        const data = await res.json();
        setReceipt((current) => ({ lastSavedAt: data.savedAt ?? new Date().toISOString(), revisionCount: previousPick?.pickedTeam === team ? current.revisionCount : current.revisionCount + 1 }));
        toast.success(`${team} saved`, { description: `Week ${weekNumber} receipt updated` });
      }
    } catch {
      toast.error('Failed to save pick');
    } finally {
      setSavingPick(null);
    }
  };

  const flushTiebreakerSave = useCallback(async (): Promise<void> => {
    if (!week?.id || tiebreakerSaveInFlightRef.current) return;
    tiebreakerSaveInFlightRef.current = true;

    try {
      // Serialize saves so a slower request for an older value can never
      // overwrite the user's newest tiebreaker value.
      while (pendingTiebreakerRef.current !== null) {
        const total = pendingTiebreakerRef.current;
        pendingTiebreakerRef.current = null;
        setTiebreakerSaveStatus('saving');
        setTiebreakerSaveError(null);

        try {
          const res = await fetch('/api/picks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weekId: week.id, tiebreakerTotal: total }),
          });
          const data = await res.json();

          if (!res.ok) {
            const message = data.error || 'Failed to save tiebreaker';
            pendingTiebreakerRef.current = null;
            setTiebreakerSaveStatus('error');
            setTiebreakerSaveError(message);
            if (res.status === 403) setClock(Date.now());
            toast.error(message);
            break;
          }

          setSavedTiebreaker(total);
          setReceipt((current) => ({ ...current, lastSavedAt: data.savedAt ?? new Date().toISOString() }));
          setTiebreakerSaveStatus('saved');
        } catch {
          pendingTiebreakerRef.current = null;
          setTiebreakerSaveStatus('error');
          setTiebreakerSaveError('Failed to save tiebreaker');
          toast.error('Failed to save tiebreaker');
          break;
        }
      }
    } finally {
      tiebreakerSaveInFlightRef.current = false;
      if (pendingTiebreakerRef.current !== null) void flushTiebreakerSave();
    }
  }, [week?.id]);

  const queueTiebreakerSave = useCallback((total: number) => {
    pendingTiebreakerRef.current = total;
    void flushTiebreakerSave();
  }, [flushTiebreakerSave]);

  const handleTiebreakerChange = (value: string) => {
    setTiebreakerValue(value);
    const enteredValue = value.trim();
    if (!enteredValue) {
      setTiebreakerSaveStatus('idle');
      setTiebreakerSaveError(null);
      return;
    }

    const total = Number(enteredValue);
    const validationError = tiebreakerValidationError(total);
    if (validationError) {
      setTiebreakerSaveStatus('error');
      setTiebreakerSaveError(validationError);
      return;
    }

    setTiebreakerSaveStatus(total === savedTiebreaker ? 'saved' : 'pending');
    setTiebreakerSaveError(null);
  };

  useEffect(() => {
    const tiebreakerGame = week?.tiebreakerGameId
      ? games.find((game) => game.id === week.tiebreakerGameId)
      : null;
    const isOpen = Boolean(
      week &&
      tiebreakerGame &&
      !isQueued &&
      gameIsOpen(tiebreakerGame, new Date(clock)),
    );

    if (!isOpen) {
      pendingTiebreakerRef.current = null;
      return;
    }

    const enteredValue = tiebreakerValue.trim();
    if (!enteredValue) {
      pendingTiebreakerRef.current = null;
      return;
    }

    const total = Number(enteredValue);
    const validationError = tiebreakerValidationError(total);
    if (validationError) {
      pendingTiebreakerRef.current = null;
      return;
    }

    if (total === savedTiebreaker) {
      pendingTiebreakerRef.current = null;
      return;
    }

    const timer = window.setTimeout(() => queueTiebreakerSave(total), 650);
    return () => window.clearTimeout(timer);
  }, [clock, games, isQueued, queueTiebreakerSave, savedTiebreaker, tiebreakerValue, week]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!week) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold">Week not found</h2>
      </div>
    );
  }

  const tiebreakerGame = week.tiebreakerGameId
    ? games.find((g) => g.id === week.tiebreakerGameId)
    : null;

  const gamesWithMeta: GameCardData[] = games.map((g) => ({
    ...g,
    isDoubleGame: g.id === week.doubleGameId,
    userPick: userPicks[g.id]?.pickedTeam || null,
    pickIsCorrect: userPicks[g.id]?.isCorrect ?? null,
  }));

  const pickedCount = Object.keys(userPicks).length;
  const allPicksMade = pickedCount === games.length && games.length > 0;
  const now = clock;
  const futureGames = games
    .filter((game) => gameIsOpen(game, new Date(now)))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const nextGameLockTime = futureGames[0]?.startTime;
  const remainingOpenPicks = futureGames.filter((game) => !userPicks[game.id]).length;
  const allGamesLocked = games.length > 0 && futureGames.length === 0;
  const timeToNextLock = nextGameLockTime ? new Date(nextGameLockTime).getTime() - now : 0;
  const showLockWarning = !isQueued && timeToNextLock > 0 && timeToNextLock < 60 * 60 * 1000;
  const tiebreakerLocked =
    isQueued || !tiebreakerGame || !gameIsOpen(tiebreakerGame, new Date(now));
  const entryComplete = allPicksMade && (!tiebreakerGame || savedTiebreaker !== null);
  const receiptText = `NFL Picks · Week ${weekNumber} · ${pickedCount}/${games.length} picks · Tiebreaker ${savedTiebreaker ?? 'missing'} · Saved ${receipt.lastSavedAt ? new Date(receipt.lastSavedAt).toLocaleString() : 'not yet'}`;

  return (
    <div className="space-y-6">
      <WeekNavigator selected={weekNumber} />
      {(week.scheduleUpdatedAt || games.some(g=>['postponed','canceled','suspended'].includes(g.statusState ?? '') || (g.pickLocked && new Date(g.startTime).getTime()>now))) && <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><strong>Schedule update</strong><p className="mt-1">Saved picks and guesses have been kept. Postponed, canceled, or suspended games do not accept picks. A game that already locked stays locked even if its kickoff moves. The commissioner reviews unresolved games before final standings.</p></div>}
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black gradient-text">
          {week.season?.isSandbox ? 'Sandbox ' : week.season?.seasonType === 'PRESEASON' ? 'Preseason ' : ''}Week {weekNumber} Picks
        </h1>
        {week.season?.isSandbox && (
          <p className="mt-1 text-sm text-orange-300">Commissioner rehearsal — no live-season data is affected.</p>
        )}
        {week.season?.seasonType === 'PRESEASON' && (
          <p className="text-sm text-amber-300 mt-1">
            Testing phase — these results will not carry into regular-season standings.
          </p>
        )}
      </div>

      {!week.season?.isSandbox && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm" role="status">
          {week.doubleGameId ? <>
            <p className="font-semibold text-amber-300">2× points: {games.find(g => g.id === week.doubleGameId)?.awayTeam} at {games.find(g => g.id === week.doubleGameId)?.homeTeam}</p>
            <p className="text-muted-foreground">This week’s bonus game is locked in. Later spread changes do not change it.</p>
          </> : <>
            <p className="font-semibold text-amber-300">Double-points game: awaiting Tuesday’s selection</p>
            <p className="text-muted-foreground">Announced Tuesday at 9 AM Pacific: the smallest available absolute point spread. Equal spreads use earliest kickoff. If odds are unavailable, selection retries before the week starts. You can make your picks now.</p>
          </>}
        </div>
      )}

      {/* Sticky picks bar */}
      <div className="app-sticky-under-navigation sticky z-20 -mx-3 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur-sm sm:-mx-4 sm:px-4">
        <div className="flex shrink-0 items-center gap-3">
          <span className={`text-sm font-semibold ${allPicksMade ? 'text-emerald-400' : 'text-muted-foreground'}`}>
            {pickedCount}/{games.length} picked{allPicksMade ? ' ✓' : ''}
          </span>
        </div>
        {!isQueued && nextGameLockTime && (
          <CountdownTimer
            key={new Date(nextGameLockTime).toISOString()}
            lockTime={nextGameLockTime}
            onLock={() => setClock(new Date(nextGameLockTime).getTime())}
          />
        )}
        {isQueued && <span className="text-muted-foreground text-sm font-semibold">🔒 Opens later</span>}
        {allGamesLocked && !isQueued && <span className="text-sm font-semibold text-red-400">🔒 All games locked</span>}
      </div>

      {isQueued && (
        <div className="p-3 rounded-lg bg-muted/50 border border-border text-muted-foreground text-sm">
          This schedule is preloaded. Picks open automatically after an earlier week&apos;s last kickoff.
        </div>
      )}

      {/* All picks complete banner */}
      {allPicksMade && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
          ✓ <span className="font-semibold">All {games.length} picks submitted — you&apos;re set for Week {weekNumber}!</span>
        </div>
      )}

      <Card className={`glass-card ${entryComplete ? 'border-emerald-500/40' : 'border-amber-500/30'}`}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-start gap-3"><CheckCircle2 className={`mt-0.5 h-5 w-5 ${entryComplete ? 'text-emerald-400' : 'text-amber-300'}`} /><div><p className="font-bold">{entryComplete ? 'Entry confirmed' : 'Entry receipt in progress'}</p><p className="text-xs text-muted-foreground">{pickedCount}/{games.length} picks · Tiebreaker {savedTiebreaker === null ? 'missing' : savedTiebreaker} · {receipt.revisionCount} saved revision{receipt.revisionCount === 1 ? '' : 's'}</p><p className="text-[10px] text-muted-foreground">Last saved: {receipt.lastSavedAt ? new Date(receipt.lastSavedAt).toLocaleString() : 'No save recorded'}</p></div></div><Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(receiptText).then(() => toast.success('Receipt copied'))}><Clipboard className="mr-1 h-3 w-3" />Copy receipt</Button></CardContent>
      </Card>

      {/* Lock warning */}
      {showLockWarning && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          <span className="animate-pulse">⚠️</span>
          <span className="font-semibold">Less than 1 hour until the next game locks!</span>
          {remainingOpenPicks > 0 && (
            <span className="text-amber-400/70 ml-1">{remainingOpenPicks} open pick{remainingOpenPicks !== 1 ? 's' : ''} remaining.</span>
          )}
        </div>
      )}

      {/* Games Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {gamesWithMeta.map((game, i) => (
          <motion.div
            key={game.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="relative">
              {savingPick === game.id && (
                <div className="absolute inset-0 bg-black/50 rounded-xl z-10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
              <GameCard
                game={game}
                onPick={(team) => handlePick(game.id, team)}
                isLocked={isQueued || !gameIsOpen(game, new Date(now))}
                showPickButtons={!isQueued && gameIsOpen(game, new Date(now))}
                showGamecast={Boolean(week.season?.isSandbox && game.statusState === 'in')}
              />
              {new Date(game.startTime).getTime() <= now && <PickDistribution gameId={game.id} />}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tiebreaker */}
      {tiebreakerGame && (
        <Card className="glass-card border-yellow-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Tiebreaker
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Guess the combined final score for{' '}
              <span className="text-foreground font-semibold">
                {tiebreakerGame.awayTeam} @ {tiebreakerGame.homeTeam}
              </span>
              . Used to break ties in weekly rankings.
            </p>
            {tiebreakerLocked ? (
              <p className="text-sm">
                Your guess:{' '}
                <span className="font-bold text-yellow-500">
                  {savedTiebreaker ?? 'Not submitted'}
                </span>
              </p>
            ) : (
              <div className="max-w-xs">
                <div>
                  <Label htmlFor="tiebreaker" className="text-sm mb-1 block">
                    Combined score total
                  </Label>
                  <Input
                    id="tiebreaker"
                    type="number"
                    placeholder="e.g. 47"
                    value={tiebreakerValue}
                    onChange={(e) => handleTiebreakerChange(e.target.value)}
                    onBlur={() => {
                      const total = Number(tiebreakerValue);
                      if (tiebreakerValue.trim() && !tiebreakerValidationError(total) && total !== savedTiebreaker) {
                        queueTiebreakerSave(total);
                      }
                    }}
                    className="bg-muted/50 border-border"
                    min={0}
                    max={200}
                    step={1}
                    inputMode="numeric"
                    aria-describedby="tiebreaker-save-status"
                    aria-invalid={tiebreakerSaveStatus === 'error'}
                  />
                </div>
                <div
                  id="tiebreaker-save-status"
                  className={`mt-2 flex min-h-5 items-center gap-1.5 text-xs ${
                    tiebreakerSaveStatus === 'error' ? 'text-red-400' :
                    tiebreakerSaveStatus === 'saved' ? 'text-emerald-400' :
                    'text-muted-foreground'
                  }`}
                  aria-live="polite"
                >
                  {tiebreakerSaveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {tiebreakerSaveStatus === 'idle' && 'Enter a number — it saves automatically.'}
                  {tiebreakerSaveStatus === 'pending' && 'Waiting to save…'}
                  {tiebreakerSaveStatus === 'saving' && 'Saving…'}
                  {tiebreakerSaveStatus === 'saved' && `Saved: ${savedTiebreaker}`}
                  {tiebreakerSaveStatus === 'error' && tiebreakerSaveError}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
