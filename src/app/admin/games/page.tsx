'use client';

import { useEffect, useState } from 'react';
import ManualGameForm from '@/components/admin/ManualGameForm';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Edit, Trophy } from 'lucide-react';

interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  startTime: string;
  isFinal: boolean;
  statusState: string | null;
  espnGameId: string | null;
}

interface Week {
  id: string;
  weekNumber: number;
  games: Game[];
  doubleGameId: string | null;
  tiebreakerGameId: string | null;
}

interface Season {
  id: string;
  year: number;
  isActive: boolean;
  weeks: Week[];
}

export default function AdminGamesPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [settingWinner, setSettingWinner] = useState<string | null>(null);
  const [editGame, setEditGame] = useState<{ id: string; weekId: string } | null>(null);
  const [editHomeScore, setEditHomeScore] = useState('');
  const [editAwayScore, setEditAwayScore] = useState('');

  const load = () => {
    fetch('/api/admin/weeks')
      .then((r) => r.json())
      .then((d) => setSeasons(d.seasons || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const syncScores = async (weekId: string) => {
    setSyncing(weekId);
    try {
      const res = await fetch('/api/admin/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_scores', weekId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Synced ${data.updatedCount} games from ESPN`);
        load();
      } else {
        toast.error(data.error || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  const setWinner = async (gameId: string, winnerTeam: string | null) => {
    setSettingWinner(gameId);
    try {
      const res = await fetch('/api/admin/games', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, winnerTeam }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(winnerTeam ? `Winner set: ${winnerTeam}` : 'Winner cleared');
        load();
      } else {
        toast.error(data.error || 'Failed to set winner');
      }
    } catch {
      toast.error('Failed to set winner');
    } finally {
      setSettingWinner(null);
    }
  };

  const manualScore = async () => {
    if (!editGame) return;
    try {
      const res = await fetch('/api/admin/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manual_score',
          gameId: editGame.id,
          homeScore: parseInt(editHomeScore),
          awayScore: parseInt(editAwayScore),
        }),
      });
      if (res.ok) {
        toast.success('Score updated');
        setEditGame(null);
        load();
      } else {
        toast.error('Failed to update score');
      }
    } catch {
      toast.error('Failed to update score');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <ManualGameForm weeks={seasons.filter(s=>s.isActive).flatMap(s=>s.weeks.map(w=>({id:w.id,label:`${s.year} · Week ${w.weekNumber}`})))} onCreated={load} />
      {seasons.map((season) =>
        season.weeks.map((week) => (
          <Card key={week.id} className="glass-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Week {week.weekNumber}</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncScores(week.id)}
                  disabled={syncing === week.id}
                  className="gap-2"
                >
                  {syncing === week.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Sync ESPN
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {week.games.map((game) => (
                  <div key={game.id} className="border-b border-white/5 last:border-0 pb-3 last:pb-0">
                    {/* Game info + score row */}
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{game.awayTeam} @ {game.homeTeam}</span>
                        {game.id === week.doubleGameId && (
                          <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-xs">2×</Badge>
                        )}
                        {game.id === week.tiebreakerGameId && (
                          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">TB</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {game.isFinal ? (
                          <span className="font-bold">{game.awayScore} - {game.homeScore}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {game.statusState === 'in' ? '🔴 LIVE' : 'Upcoming'}
                          </span>
                        )}
                        {editGame?.id === game.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={editAwayScore}
                              onChange={(e) => setEditAwayScore(e.target.value)}
                              className="w-16 h-7 text-xs bg-muted/50"
                              placeholder="Away"
                            />
                            <span>-</span>
                            <Input
                              type="number"
                              value={editHomeScore}
                              onChange={(e) => setEditHomeScore(e.target.value)}
                              className="w-16 h-7 text-xs bg-muted/50"
                              placeholder="Home"
                            />
                            <Button size="sm" className="h-7 text-xs" onClick={manualScore}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditGame(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditGame({ id: game.id, weekId: week.id });
                              setEditHomeScore(game.homeScore?.toString() || '');
                              setEditAwayScore(game.awayScore?.toString() || '');
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* Set Winner row */}
                    <div className="flex items-center gap-2 mt-1">
                      <Trophy className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Winner:</span>
                      <select
                        value={game.winnerTeam ?? ''}
                        disabled={settingWinner === game.id}
                        onChange={(e) => setWinner(game.id, e.target.value || null)}
                        className="text-xs bg-muted/50 border border-border rounded px-2 py-0.5 text-foreground focus:outline-none focus:border-primary/50 disabled:opacity-50"
                      >
                        <option value="">-- clear --</option>
                        <option value={game.awayTeam}>{game.awayTeam} (away)</option>
                        <option value={game.homeTeam}>{game.homeTeam} (home)</option>
                      </select>
                      {settingWinner === game.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  startTime: string;
  isFinal: boolean;
  statusState: string | null;
  espnGameId: string | null;
}

interface Week {
  id: string;
  weekNumber: number;
  games: Game[];
  doubleGameId: string | null;
  tiebreakerGameId: string | null;
}

interface Season {
  id: string;
  year: number;
  isActive: boolean;
  weeks: Week[];
}
