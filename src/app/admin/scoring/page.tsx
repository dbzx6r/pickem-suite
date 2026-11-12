'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, BarChart3, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';

interface Game {
  id: string;
  isFinal: boolean;
}

interface Week {
  id: string;
  weekNumber: number;
  lockTime: string;
  isFinal: boolean;
  games: Game[];
  _count: { picks: number };
}

interface Season {
  id: string;
  year: number;
  isActive: boolean;
  weeks: Week[];
}

interface ScoreEntry {
  userId: string;
  displayName: string;
  points: number;
  finalRank: number | null;
  adminOverridePoints: number | null;
  adminOverrideNote: string | null;
}

export default function AdminScoringPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, ScoreEntry[]>>({});
  const [scoresLoading, setScoresLoading] = useState<string | null>(null);
  const [overrideInputs, setOverrideInputs] = useState<Record<string, { points: string; note: string }>>({});
  const [savingOverride, setSavingOverride] = useState<string | null>(null);

  const fetchWeeks = () => {
    fetch('/api/admin/weeks')
      .then((r) => r.json())
      .then((d) => {
        setSeasons(d.seasons || []);
        setLoading(false);
      });
  };

  useEffect(() => { fetchWeeks(); }, []);

  const runScoring = async (weekId: string) => {
    setCalculating(weekId);
    try {
      const res = await fetch('/api/admin/scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekId }),
      });
      if (res.ok) {
        toast.success('Scores calculated!');
        fetchWeeks();
        if (expandedWeek === weekId) {
          await loadScores(weekId);
        }
      } else {
        const d = await res.json();
        toast.error(d.error || 'Scoring failed');
      }
    } finally {
      setCalculating(null);
    }
  };

  const loadScores = async (weekId: string) => {
    setScoresLoading(weekId);
    try {
      const res = await fetch(`/api/admin/scoring?weekId=${weekId}`);
      if (res.ok) {
        const data = await res.json();
        setScores((prev) => ({ ...prev, [weekId]: data.scores }));
        const inputs: Record<string, { points: string; note: string }> = {};
        for (const s of data.scores as ScoreEntry[]) {
          inputs[s.userId] = {
            points: s.adminOverridePoints !== null ? String(s.adminOverridePoints) : '',
            note: s.adminOverrideNote ?? '',
          };
        }
        setOverrideInputs(inputs);
      }
    } finally {
      setScoresLoading(null);
    }
  };

  const toggleExpand = async (weekId: string) => {
    if (expandedWeek === weekId) {
      setExpandedWeek(null);
      return;
    }
    setExpandedWeek(weekId);
    if (!scores[weekId]) {
      await loadScores(weekId);
    }
  };

  const saveOverride = async (weekId: string, userId: string, explicitInput?: { points: string; note: string }) => {
    const key = `${weekId}-${userId}`;
    setSavingOverride(key);
    const input = explicitInput ?? overrideInputs[userId] ?? { points: '', note: '' };
    const overridePoints = input.points.trim() === '' ? null : parseInt(input.points, 10);
    if (overridePoints !== null && isNaN(overridePoints)) {
      toast.error('Override points must be a number');
      setSavingOverride(null);
      return;
    }
    try {
      const res = await fetch('/api/admin/score-override', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          weekId,
          overridePoints,
          overrideNote: input.note.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success(overridePoints === null ? 'Override cleared' : 'Override saved & scores recalculated');
        await loadScores(weekId);
      } else {
        const d = await res.json();
        toast.error(d.error || 'Failed');
      }
    } finally {
      setSavingOverride(null);
    }
  };

  const clearOverride = (weekId: string, userId: string) => {
    setOverrideInputs((prev) => ({ ...prev, [userId]: { points: '', note: '' } }));
    void saveOverride(weekId, userId, { points: '', note: '' });
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Calculate Scores</h1>
      <p className="text-muted-foreground">
        Run scoring for a week and set per-user point overrides. Overrides replace a user&apos;s points for ranking purposes while preserving their actual pick-based score.
      </p>

      {seasons.map((season) => (
        <div key={season.id}>
          <h2 className="text-lg font-bold mb-3">{season.year} Season</h2>
          <div className="space-y-3">
            {season.weeks.map((week) => {
              const finalGames = week.games.filter((g) => g.isFinal).length;
              const isExpanded = expandedWeek === week.id;
              const weekScores = scores[week.id] ?? [];

              return (
                <Card key={week.id} className="glass-card border-border">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-lg">Week {week.weekNumber}</div>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <Badge variant="secondary">{finalGames}/{week.games.length} final</Badge>
                          {week.isFinal && <Badge className="bg-green-500/20 text-green-400">Final</Badge>}
                          <span className="text-xs text-muted-foreground self-center">
                            Lock: {new Date(week.lockTime).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runScoring(week.id)}
                          disabled={calculating === week.id}
                          className="gap-1"
                        >
                          {calculating === week.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <BarChart3 className="h-3 w-3" />
                          )}
                          Score
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpand(week.id)}
                          className="gap-1"
                        >
                          <Pencil className="h-3 w-3" />
                          Overrides
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    {/* Score Override Panel */}
                    {isExpanded && (
                      <div className="mt-4 border-t border-border pt-4">
                        {scoresLoading === week.id ? (
                          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                        ) : weekScores.length === 0 ? (
                          <p className="text-muted-foreground text-sm text-center py-2">No scores yet. Run scoring first.</p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground mb-3">
                              Set an override to replace a user&apos;s point total for ranking. Leave blank to use actual pick-based points. Saving re-runs ranking.
                            </p>
                            {weekScores.map((s) => {
                              const key = `${week.id}-${s.userId}`;
                              const input = overrideInputs[s.userId] ?? { points: '', note: '' };
                              const hasOverride = s.adminOverridePoints !== null;
                              return (
                                <div key={s.userId} className="flex flex-wrap items-center gap-2 py-2 border-b border-white/5 last:border-0">
                                  <div className="w-full min-w-0 sm:w-32 sm:shrink-0">
                                    <span className="text-sm font-medium truncate block">{s.displayName}</span>
                                    <span className="text-xs text-muted-foreground">
                                      Rank #{s.finalRank ?? '—'} · {s.points} pts
                                      {hasOverride && (
                                        <span className="text-orange-400 ml-1">→ {s.adminOverridePoints} override</span>
                                      )}
                                    </span>
                                  </div>
                                  <Input
                                    type="number"
                                    placeholder="Override pts"
                                    value={input.points}
                                    onChange={(e) =>
                                      setOverrideInputs((prev) => ({
                                        ...prev,
                                        [s.userId]: { ...input, points: e.target.value },
                                      }))
                                    }
                                    className="h-9 w-28 border-border bg-muted/50 text-sm"
                                  />
                                  <Input
                                    type="text"
                                    placeholder="Note (optional)"
                                    value={input.note}
                                    onChange={(e) =>
                                      setOverrideInputs((prev) => ({
                                        ...prev,
                                        [s.userId]: { ...input, note: e.target.value },
                                      }))
                                    }
                                    className="h-9 min-w-0 flex-[1_1_140px] border-border bg-muted/50 text-sm"
                                  />
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs"
                                      disabled={savingOverride === key}
                                      onClick={() => saveOverride(week.id, s.userId)}
                                    >
                                      {savingOverride === key ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                                    </Button>
                                    {hasOverride && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 text-xs text-red-400 hover:text-red-300"
                                        disabled={savingOverride === key}
                                        onClick={() => clearOverride(week.id, s.userId)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {season.weeks.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No weeks found for this season.</p>
            )}
          </div>
        </div>
      ))}
      {seasons.length === 0 && (
        <p className="text-muted-foreground text-center py-8">No seasons found.</p>
      )}
    </div>
  );
}
