'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FlaskConical, Plus, Trash2, PlayCircle, RefreshCw, LogIn, CheckSquare, Tv } from 'lucide-react';
import { SANDBOX_COOKIE } from '@/lib/sandboxContext';
import { useRouter } from 'next/navigation';
import SandboxGamecastEditor, { SandboxEditableGame } from '@/components/SandboxGamecastEditor';

const NFL_TEAMS = [
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE',
  'DAL','DEN','DET','GB','HOU','IND','JAX','KC',
  'LAC','LAR','LV','MIA','MIN','NE','NO','NYG',
  'NYJ','PHI','PIT','SEA','SF','TB','TEN','WSH',
];

interface SandboxGame extends SandboxEditableGame {
  startTime: string;
  isFinal: boolean;
  winnerTeam: string | null;
}

interface SandboxWeek {
  id: string;
  weekNumber: number;
  lockTime: string;
  doubleGameId: string | null;
  tiebreakerGameId: string | null;
  games: SandboxGame[];
}

interface SandboxSeason {
  id: string;
  year: number;
  isActive: boolean;
  isSandbox: boolean;
  weeks: SandboxWeek[];
}

function localDateTimeToIso(value: string): string {
  return new Date(value).toISOString();
}

function localDateTimeValue(date: Date): string {
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60_000));
  return local.toISOString().slice(0, 16);
}

function sandboxGameStatus(game: SandboxGame): 'scheduled' | 'live' | 'final' {
  if (game.isFinal || game.statusState === 'post') return 'final';
  if (game.statusState === 'in' || new Date(game.startTime).getTime() <= Date.now()) return 'live';
  return 'scheduled';
}

export default function AdminSandboxPage() {
  const router = useRouter();
  const [season, setSeason] = useState<SandboxSeason | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);

  // Add week form state
  const [newWeekNum, setNewWeekNum] = useState('1');
  const [newWeekLock, setNewWeekLock] = useState('');

  // Add game form state
  const [newGameHome, setNewGameHome] = useState('KC');
  const [newGameAway, setNewGameAway] = useState('LV');
  const [newGameStart, setNewGameStart] = useState('');
  const [newGameDouble, setNewGameDouble] = useState(false);
  const [newGameTiebreaker, setNewGameTiebreaker] = useState(false);

  // Score entry state per game
  const [scoreInputs, setScoreInputs] = useState<Record<string, { home: string; away: string }>>({});

  // Scoring result
  const [scoringResult, setScoringResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sandbox');
      const data = await res.json();
      setSeason(data.season);
      if (data.season?.weeks?.length > 0 && !selectedWeekId) {
        setSelectedWeekId(data.season.weeks[0].id);
      }
    } catch {
      toast.error('Failed to load sandbox data');
    } finally {
      setLoading(false);
    }
  }, [selectedWeekId]);

  useEffect(() => { const timer = window.setTimeout(() => void fetchData(), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateSeason = async () => {
    const res = await fetch('/api/admin/sandbox', { method: 'POST' });
    if (res.ok) { toast.success('Sandbox season created'); fetchData(); }
    else toast.error('Failed to create sandbox season');
  };

  const handleNuke = async () => {
    if (prompt('Delete the entire sandbox season and all related test data? Type DELETE SANDBOX to continue.') !== 'DELETE SANDBOX') return;
    const res = await fetch('/api/admin/sandbox', { method: 'DELETE' });
    if (res.ok) { toast.success('Sandbox nuked'); setSeason(null); setSelectedWeekId(null); }
    else toast.error('Failed to nuke sandbox');
  };

  const handleAddWeek = async () => {
    if (!newWeekNum || !newWeekLock) { toast.error('Fill in week number and lock time'); return; }
    const res = await fetch('/api/admin/sandbox/weeks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekNumber: newWeekNum, lockTime: localDateTimeToIso(newWeekLock) }),
    });
    if (res.ok) { toast.success('Week added'); fetchData(); }
    else toast.error('Failed to add week');
  };

  const handleDeleteWeek = async (weekId: string) => {
    if (!confirm('Delete this week and all its games?')) return;
    const res = await fetch('/api/admin/sandbox/weeks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekId }),
    });
    if (res.ok) {
      toast.success('Week deleted');
      if (selectedWeekId === weekId) setSelectedWeekId(null);
      fetchData();
    } else toast.error('Failed to delete week');
  };

  const handleAddGame = async () => {
    if (!selectedWeekId || !newGameStart) { toast.error('Select a week and set start time'); return; }
    const res = await fetch('/api/admin/sandbox/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekId: selectedWeekId,
        homeTeam: newGameHome,
        awayTeam: newGameAway,
        startTime: localDateTimeToIso(newGameStart),
        isDoubleGame: newGameDouble,
        isTiebreakerGame: newGameTiebreaker,
      }),
    });
    if (res.ok) { toast.success('Game added'); setNewGameDouble(false); setNewGameTiebreaker(false); fetchData(); }
    else toast.error('Failed to add game');
  };

  const handleMarkFinal = async (gameId: string) => {
    const si = scoreInputs[gameId];
    if (!si?.home || !si?.away) { toast.error('Enter home and away scores first'); return; }
    const res = await fetch('/api/admin/sandbox/games', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, homeScore: si.home, awayScore: si.away, markFinal: true }),
    });
    if (res.ok) { toast.success('Game marked final'); fetchData(); }
    else toast.error('Failed to mark final');
  };

  const handleSaveScore = async (gameId: string) => {
    const si = scoreInputs[gameId];
    if (!si?.home || !si?.away) { toast.error('Enter scores first'); return; }
    const res = await fetch('/api/admin/sandbox/games', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, homeScore: si.home, awayScore: si.away, markFinal: false }),
    });
    if (res.ok) { toast.success('Score saved'); fetchData(); }
    else toast.error('Failed to save score');
  };

  const handleDeleteGame = async (gameId: string) => {
    if (!confirm('Delete this game?')) return;
    const res = await fetch('/api/admin/sandbox/games', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    });
    if (res.ok) { toast.success('Game deleted'); fetchData(); }
    else toast.error('Failed to delete game');
  };

  const handleRunScoring = async () => {
    if (!selectedWeekId) { toast.error('Select a week first'); return; }
    setScoringResult('Running...');
    const res = await fetch('/api/admin/scoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekId: selectedWeekId }),
    });
    if (res.ok) {
      setScoringResult('Scoring completed successfully');
      toast.success('Scoring complete');
    } else {
      setScoringResult('Scoring failed');
      toast.error('Scoring failed');
    }
  };

  const handleReset = async () => {
    if (prompt('Games will remain, but all sandbox picks, tiebreakers, and scores will be deleted. Type RESET SANDBOX to continue.') !== 'RESET SANDBOX') return;
    const res = await fetch('/api/admin/sandbox/reset', { method: 'POST' });
    if (res.ok) { toast.success('Sandbox picks/scores reset'); fetchData(); }
    else toast.error('Failed to reset');
  };

  const enterSandboxAt = (href: string) => {
    document.cookie = `${SANDBOX_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 7}`;
    router.push(href);
    router.refresh();
  };

  const handleEnterSandbox = () => {
    enterSandboxAt(selectedWeek ? `/picks/${selectedWeek.weekNumber}` : '/picks');
  };

  const selectedWeek = season?.weeks.find(w => w.id === selectedWeekId) ?? null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-7 w-7 text-orange-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Sandbox Mode</h1>
            <p className="text-slate-400 text-sm">Isolated test environment — no live data affected</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleEnterSandbox} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
            <LogIn className="h-4 w-4" />
            {selectedWeek ? `Make Week ${selectedWeek.weekNumber} Picks` : 'Enter Sandbox Picks'}
          </Button>
          {selectedWeek && (
            <Button onClick={() => enterSandboxAt(`/games?week=${selectedWeek.weekNumber}`)} variant="outline" className="gap-2 border-emerald-500/40 text-emerald-300">
              <Tv className="h-4 w-4" /> Preview Live Games
            </Button>
          )}
        </div>
      </div>

      {/* Section A: Season Management */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white text-lg">Sandbox Season</CardTitle>
          <CardDescription className="text-slate-400">Manage the isolated test season</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="h-16 bg-slate-800 animate-pulse rounded-lg" />
          ) : season ? (
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-orange-500/30">
              <div className="flex items-center gap-3">
                <FlaskConical className="h-5 w-5 text-orange-400" />
                <div>
                  <p className="text-white font-medium">{season.year} Sandbox Season</p>
                  <p className="text-slate-400 text-sm">{season.weeks.length} week(s) · ID: {season.id.slice(0, 8)}…</p>
                </div>
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">SANDBOX</Badge>
              </div>
              <Button variant="destructive" size="sm" onClick={handleNuke} className="gap-1">
                <Trash2 className="h-3.5 w-3.5" />
                Nuke Sandbox
              </Button>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-4">No sandbox season exists yet.</p>
              <Button onClick={handleCreateSeason} className="bg-orange-500 hover:bg-orange-600 gap-2">
                <Plus className="h-4 w-4" />
                Create Sandbox Season
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {season && (
        <>
          {/* Section B: Weeks */}
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white text-lg">Sandbox Weeks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Existing weeks */}
              <div className="space-y-2">
                {season.weeks.map(week => (
                  <div
                    key={week.id}
                    onClick={() => setSelectedWeekId(week.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedWeekId === week.id
                        ? 'border-orange-500/50 bg-orange-500/10'
                        : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <span className="text-white font-medium">Week {week.weekNumber}</span>
                      <span className="text-slate-400 text-sm ml-3">
                        Lock: {new Date(week.lockTime).toLocaleString()} · {week.games.length} game(s)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => { e.stopPropagation(); handleDeleteWeek(week.id); }}
                      className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {/* Add week form */}
              <Separator className="bg-slate-700/50" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300 text-xs mb-1 block">Week Number</Label>
                  <Input
                    type="number" value={newWeekNum} onChange={e => setNewWeekNum(e.target.value)}
                    className="bg-slate-800 border-slate-600 text-white"
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-xs mb-1 block">Lock Time</Label>
                  <div className="flex gap-2">
                    <Input
                      type="datetime-local" value={newWeekLock} onChange={e => setNewWeekLock(e.target.value)}
                      className="bg-slate-800 border-slate-600 text-white flex-1"
                    />
                    <Button
                      variant="outline" size="sm"
                      onClick={() => {
                        const d = new Date(Date.now() + 60_000);
                        setNewWeekLock(localDateTimeValue(d));
                      }}
                      className="border-slate-600 text-slate-300 text-xs whitespace-nowrap"
                    >
                      Lock in 1 min
                    </Button>
                  </div>
                </div>
              </div>
              <Button onClick={handleAddWeek} className="w-full bg-slate-700 hover:bg-slate-600 gap-2">
                <Plus className="h-4 w-4" />
                Add Week
              </Button>
            </CardContent>
          </Card>

          {/* Section C: Games for selected week */}
          {selectedWeek && (
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-white text-lg">
                  Week {selectedWeek.weekNumber} — Games
                  <Badge className="ml-2 bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                    {selectedWeek.games.length} game(s)
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Game list */}
                <div className="space-y-3">
                  {selectedWeek.games.map(game => (
                    <div key={game.id} className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-mono font-bold">{game.awayTeam} @ {game.homeTeam}</span>
                          {game.id === selectedWeek.doubleGameId && (
                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">2×</Badge>
                          )}
                          {game.id === selectedWeek.tiebreakerGameId && (
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">TB</Badge>
                          )}
                          {sandboxGameStatus(game) === 'final' && (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                              FINAL {game.awayScore}–{game.homeScore}
                            </Badge>
                          )}
                          {sandboxGameStatus(game) === 'live' && (
                            <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">LIVE</Badge>
                          )}
                          {sandboxGameStatus(game) === 'scheduled' && (
                            <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30 text-xs">SCHEDULED</Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost" size="sm" onClick={() => handleDeleteGame(game.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {!game.isFinal && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number" placeholder="Away score"
                            value={scoreInputs[game.id]?.away ?? ''}
                            onChange={e => setScoreInputs(prev => ({
                              ...prev,
                              [game.id]: { ...prev[game.id], away: e.target.value }
                            }))}
                            className="w-28 bg-slate-700 border-slate-600 text-white text-sm h-8"
                          />
                          <span className="text-slate-400">–</span>
                          <Input
                            type="number" placeholder="Home score"
                            value={scoreInputs[game.id]?.home ?? ''}
                            onChange={e => setScoreInputs(prev => ({
                              ...prev,
                              [game.id]: { ...prev[game.id], home: e.target.value }
                            }))}
                            className="w-28 bg-slate-700 border-slate-600 text-white text-sm h-8"
                          />
                          <Button size="sm" variant="outline" onClick={() => handleSaveScore(game.id)}
                            className="border-slate-600 text-slate-300 h-8 text-xs">
                            Save Score
                          </Button>
                          <Button size="sm" onClick={() => handleMarkFinal(game.id)}
                            className="bg-green-600 hover:bg-green-700 h-8 text-xs gap-1">
                            <CheckSquare className="h-3 w-3" />
                            Mark Final
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-slate-400">
                        Kickoff: {new Date(game.startTime).toLocaleString()} · automatically appears live after kickoff unless marked final
                      </p>
                      <SandboxGamecastEditor
                        key={`${game.id}-${game.statusState}-${game.period}-${game.clock}-${game.homeScore}-${game.awayScore}-${JSON.stringify(game.sandboxSituation)}`}
                        game={game}
                        onSaved={fetchData}
                      />
                    </div>
                  ))}
                </div>

                <Separator className="bg-slate-700/50" />

                {/* Add game form */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-300 text-xs mb-1 block">Away Team</Label>
                    <select
                      value={newGameAway} onChange={e => setNewGameAway(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 text-white rounded-md px-3 py-2 text-sm"
                    >
                      {NFL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-slate-300 text-xs mb-1 block">Home Team</Label>
                    <select
                      value={newGameHome} onChange={e => setNewGameHome(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 text-white rounded-md px-3 py-2 text-sm"
                    >
                      {NFL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-slate-300 text-xs mb-1 block">Start Time</Label>
                  <Input
                    type="datetime-local" value={newGameStart} onChange={e => setNewGameStart(e.target.value)}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                    <input type="checkbox" checked={newGameDouble} onChange={e => setNewGameDouble(e.target.checked)}
                      className="rounded" />
                    Double Points Game (2×)
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                    <input type="checkbox" checked={newGameTiebreaker} onChange={e => setNewGameTiebreaker(e.target.checked)}
                      className="rounded" />
                    Tiebreaker Game
                  </label>
                </div>
                <Button onClick={handleAddGame} className="w-full bg-slate-700 hover:bg-slate-600 gap-2">
                  <Plus className="h-4 w-4" />
                  Add Game
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Section D: Scoring Controls */}
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white text-lg">Scoring Controls</CardTitle>
              <CardDescription className="text-slate-400">Run scoring for the selected week</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={handleRunScoring} disabled={!selectedWeekId}
                className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                <PlayCircle className="h-4 w-4" />
                Run Scoring for Week {selectedWeek?.weekNumber ?? '—'}
              </Button>
              {scoringResult && (
                <p className={`text-sm font-mono p-2 rounded bg-slate-800 ${
                  scoringResult.includes('failed') ? 'text-red-400' : 'text-green-400'
                }`}>
                  {scoringResult}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Section E: Reset */}
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white text-lg">Reset Picks &amp; Scores</CardTitle>
              <CardDescription className="text-slate-400">
                Deletes all picks, tiebreakers, and weekly scores for sandbox weeks. Games are kept.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleReset} variant="outline"
                className="border-orange-800/50 text-orange-400 hover:bg-orange-950/30 gap-2">
                <RefreshCw className="h-4 w-4" />
                Reset Picks &amp; Scores
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
