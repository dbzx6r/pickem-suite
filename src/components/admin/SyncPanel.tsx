'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, CheckCircle, XCircle, RotateCcw } from 'lucide-react';

interface SyncResult {
  ok: boolean;
  results: string[];
  error?: string;
  timestamp: string;
}

interface SyncPanelProps {
  seasonYear?: number;
  seasonType?: string;
}

export default function SyncPanel({ seasonYear, seasonType }: SyncPanelProps) {
  const [syncing, setSyncing] = useState(false);
  const [startingRegularSeason, setStartingRegularSeason] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/sync', { method: 'POST' });
      const data = await res.json();
      setLastResult({ ...data, timestamp: new Date().toLocaleString() });
    } catch {
      setLastResult({ ok: false, results: [], error: 'Network error', timestamp: new Date().toLocaleString() });
    } finally {
      setSyncing(false);
    }
  };

  const startRegularSeason = async () => {
    if (!seasonYear) return;
    const expected = `START ${seasonYear} REGULAR SEASON`;
    const confirmed = window.prompt(`Preseason results will be preserved, but the live leaderboard and profile statistics will switch phases. Type exactly:\n\n${expected}`);
    if (confirmed !== expected) return;

    setStartingRegularSeason(true);
    try {
      const res = await fetch('/api/admin/season', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_regular_season', year: seasonYear }),
      });
      const data = await res.json();
      setLastResult({
        ok: res.ok,
        results: data.message ? [data.message] : [],
        error: res.ok ? undefined : data.error || 'Season transition failed',
        timestamp: new Date().toLocaleString(),
      });
      if (res.ok) window.location.reload();
    } catch {
      setLastResult({
        ok: false,
        results: [],
        error: 'Network error',
        timestamp: new Date().toLocaleString(),
      });
    } finally {
      setStartingRegularSeason(false);
    }
  };

  return (
    <Card className="glass-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Manual Sync
          </span>
          <Button size="sm" onClick={runSync} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? 'Syncing…' : 'Sync Now'}
          </Button>
        </CardTitle>
      </CardHeader>
      {lastResult && (
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            {lastResult.ok ? (
              <CheckCircle className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-400" />
            )}
            <span>{lastResult.timestamp}</span>
          </div>
          {lastResult.error && (
            <p className="text-xs text-red-400 mb-2">{lastResult.error}</p>
          )}
          <ul className="space-y-1">
            {lastResult.results.map((r, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                • {r}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
      {seasonType === 'PRESEASON' && seasonYear && (
        <CardContent className={lastResult ? 'pt-0' : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div>
              <p className="text-sm font-semibold text-amber-300">Preseason testing is active</p>
              <p className="text-xs text-muted-foreground">
                ESPN will switch to regular-season standings automatically. Use this only if that transition fails.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={startRegularSeason}
              disabled={startingRegularSeason}
              className="gap-2 border-amber-500/40"
            >
              {startingRegularSeason
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RotateCcw className="h-4 w-4" />}
              Start Regular Season
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
