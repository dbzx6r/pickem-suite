'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Calculator } from 'lucide-react';

interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  isFinal: boolean;
}

interface Week {
  id: string;
  weekNumber: number;
  lockTime: string;
  isFinal: boolean;
  recapVisible: boolean;
  doubleGameId: string | null;
  tiebreakerGameId: string | null;
  games: Game[];
  _count: { picks: number };
}

interface Season {
  id: string;
  year: number;
  isActive: boolean;
  weeks: Week[];
}

export default function AdminWeeksPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [newWeekNumber, setNewWeekNumber] = useState('');
  const [creating, setCreating] = useState(false);
  const [scoring, setScoring] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    fetch('/api/admin/weeks')
      .then((r) => r.json())
      .then((d) => setSeasons(d.seasons || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { const timer = window.setTimeout(() => void fetchData(), 0); return () => window.clearTimeout(timer); }, []);

  const activeSeason = seasons.find((s) => s.isActive);

  const createWeek = async () => {
    if (!activeSeason || !newWeekNumber) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_week',
          seasonId: activeSeason.id,
          weekNumber: parseInt(newWeekNumber),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Week ${newWeekNumber} created with ${data.gamesCount} games!`);
        setNewWeekNumber('');
        fetchData();
      } else {
        toast.error(data.error || 'Failed to create week');
      }
    } catch {
      toast.error('Failed to create week');
    } finally {
      setCreating(false);
    }
  };

  const toggleFinal = async (weekId: string, current: boolean) => {
    const res = await fetch('/api/admin/weeks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_week', weekId, isFinal: !current }),
    });
    if (res.ok) { toast.success('Updated'); fetchData(); }
    else toast.error('Failed to update');
  };

  const toggleRecap = async (weekId: string, current: boolean) => {
    const res = await fetch('/api/admin/weeks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_week', weekId, recapVisible: !current }),
    });
    if (res.ok) { toast.success('Updated'); fetchData(); }
    else toast.error('Failed to update');
  };

  const runScoring = async (weekId: string) => {
    setScoring(weekId);
    try {
      const res = await fetch('/api/admin/scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekId }),
      });
      if (res.ok) toast.success('Scoring complete!');
      else toast.error('Scoring failed');
    } catch {
      toast.error('Scoring failed');
    } finally {
      setScoring(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Create Week */}
      {activeSeason && (
        <Card className="glass-card border-border">
          <CardHeader>
            <CardTitle>Create Week — {activeSeason.year} Season</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div>
                <Label htmlFor="weekNum" className="mb-1 block">Week Number</Label>
                <Input
                  id="weekNum"
                  type="number"
                  min={1}
                  max={18}
                  placeholder="1-18"
                  value={newWeekNumber}
                  onChange={(e) => setNewWeekNumber(e.target.value)}
                  className="w-32 bg-muted/50 border-border"
                />
              </div>
              <Button onClick={createWeek} disabled={creating || !newWeekNumber} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Week
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Games will be auto-fetched from ESPN API
            </p>
          </CardContent>
        </Card>
      )}

      {/* Weeks List */}
      {seasons.map((season) => (
        <div key={season.id}>
          <h2 className="text-lg font-bold mb-3">{season.year} Season</h2>
          <div className="space-y-3">
            {season.weeks.map((week) => (
              <Card key={week.id} className="glass-card border-border">
                <CardContent className="py-4 px-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-bold text-lg">Week {week.weekNumber}</span>
                    <div className="flex items-center gap-2 flex-1">
                      {week.isFinal && (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Final</Badge>
                      )}
                      {week.recapVisible && (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Recap Live</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {week._count.picks} picks · {week.games.length} games
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleFinal(week.id, week.isFinal)}
                        className="text-xs"
                      >
                        {week.isFinal ? 'Unfinalize' : 'Mark Final'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleRecap(week.id, week.recapVisible)}
                        className="text-xs"
                      >
                        {week.recapVisible ? 'Hide Recap' : 'Show Recap'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runScoring(week.id)}
                        disabled={scoring === week.id}
                        className="gap-1 text-xs"
                      >
                        {scoring === week.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Calculator className="h-3 w-3" />
                        )}
                        Score
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Lock: {new Date(week.lockTime).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
