'use client';
import { useEffect, useState } from 'react';
import { THEMES, applyTheme } from '@/lib/themes';
import Navigation from '@/components/Navigation';
import GameCard, { GameCardData } from '@/components/GameCard';
import ProfilePreferences from '@/components/ProfilePreferences';
import { Button } from '@/components/ui/button';

const fixture: GameCardData = {
  id: 'preview', homeTeam: 'NYG', awayTeam: 'ARI', startTime: '2099-10-04T17:00:00Z',
  statusState: 'pre', isFinal: false, isDoubleGame: true, spreadLine: 'ARI -2.5', overUnder: 44.5,
  homeScore: null, awayScore: null, homeScoreQ1: null, homeScoreQ2: null, homeScoreQ3: null, homeScoreQ4: null,
  awayScoreQ1: null, awayScoreQ2: null, awayScoreQ3: null, awayScoreQ4: null, winnerTeam: null,
  period: null, clock: null, possession: null, downDistance: null, homeTimeOfPossession: null, awayTimeOfPossession: null,
};
export default function ThemePreview() {
  const [theme, setTheme] = useState('light');
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { applyTheme(theme, '#241773'); }, [theme]);
  return <>
    <Navigation leagueName="NFL Picks • preview" user={{ id: 'preview', email: 'preview@example.invalid', name: 'Preview User', role: 'ADMIN' }} />
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <label className="block">Preview theme <select aria-label="Preview theme" className="rounded border bg-card p-2" value={theme} onChange={e => setTheme(e.target.value)}>{THEMES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Your league. Your home field.</p><h1 className="mt-2 text-3xl font-bold">Every pick counts.</h1><p className="mt-2 text-muted-foreground">Development preview · synthetic data only</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <GameCard game={{ ...fixture, userPick: pick }} onPick={setPick} showPickButtons />
        <section className="glass-card space-y-4 p-5"><h2 className="text-xl font-bold">Weekly leaderboard</h2><div className="rounded-lg border border-primary bg-primary/10 p-3"><p className="text-xs font-bold uppercase tracking-wide text-primary">🏆 Last week&apos;s winner</p><p className="mt-1 text-xl font-bold">Alex · 14 points</p></div><div className="flex justify-between border-b py-2"><span>2. Jordan</span><strong>12</strong></div><div className="flex justify-between border-b py-2"><span>3. Sam</span><strong>11</strong></div><div className="flex flex-wrap gap-2"><Button>Make picks</Button><Button variant="outline">Pick check</Button><Button variant="secondary">Export</Button></div></section>
      </div>
      <section className="glass-card p-5"><ProfilePreferences /></section>
    </main>
  </>;
}
