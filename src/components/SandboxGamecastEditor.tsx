'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  parseSandboxSituation,
  sandboxPreset,
  SandboxGamecastPreset,
  SandboxGamecastSituation,
} from '@/lib/sandbox-gamecast';
import { Play, Radio, Save, Square } from 'lucide-react';

export interface SandboxEditableGame {
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
  period: number | null;
  clock: string | null;
  possession: string | null;
  downDistance: string | null;
  statusState: string | null;
  sandboxSituation?: unknown;
}

interface SimulationForm {
  statusState: 'pre' | 'in' | 'post';
  homeScore: string;
  awayScore: string;
  homeScoreQ1: string;
  homeScoreQ2: string;
  homeScoreQ3: string;
  homeScoreQ4: string;
  awayScoreQ1: string;
  awayScoreQ2: string;
  awayScoreQ3: string;
  awayScoreQ4: string;
  period: string;
  clock: string;
  possession: string;
  downDistance: string;
  situation: SandboxGamecastSituation;
}

function inputScore(value: number | null): string {
  return value === null ? '' : String(value);
}

function initialForm(game: SandboxEditableGame): SimulationForm {
  return {
    statusState: game.statusState === 'post' ? 'post' : game.statusState === 'in' ? 'in' : 'pre',
    homeScore: inputScore(game.homeScore),
    awayScore: inputScore(game.awayScore),
    homeScoreQ1: inputScore(game.homeScoreQ1),
    homeScoreQ2: inputScore(game.homeScoreQ2),
    homeScoreQ3: inputScore(game.homeScoreQ3),
    homeScoreQ4: inputScore(game.homeScoreQ4),
    awayScoreQ1: inputScore(game.awayScoreQ1),
    awayScoreQ2: inputScore(game.awayScoreQ2),
    awayScoreQ3: inputScore(game.awayScoreQ3),
    awayScoreQ4: inputScore(game.awayScoreQ4),
    period: String(game.period ?? 1),
    clock: game.clock ?? '15:00',
    possession: game.possession ?? game.awayTeam,
    downDistance: game.downDistance ?? `1st & 10 at ${game.awayTeam} 25`,
    situation: parseSandboxSituation(game.sandboxSituation),
  };
}

export default function SandboxGamecastEditor({
  game,
  onSaved,
}: {
  game: SandboxEditableGame;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SimulationForm>(() => initialForm(game));
  const [saving, setSaving] = useState(false);

  const save = async (nextForm: SimulationForm = form, message = 'Gamecast updated') => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/sandbox/games', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, simulation: nextForm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Update failed');
      toast.success(message);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gamecast update failed');
    } finally {
      setSaving(false);
    }
  };

  const setStatusAndSave = (statusState: SimulationForm['statusState']) => {
    const next = {
      ...form,
      statusState,
      period: statusState === 'pre' ? '1' : form.period || '1',
      clock: statusState === 'pre' ? '15:00' : form.clock || '15:00',
    };
    setForm(next);
    void save(next, statusState === 'in' ? 'Sandbox game is live' : statusState === 'post' ? 'Sandbox game marked final' : 'Sandbox game scheduled');
  };

  const applyPreset = (preset: SandboxGamecastPreset) => {
    const situation = sandboxPreset(preset, game.awayTeam, game.homeTeam);
    const possession = preset === 'goal-to-go' ? game.homeTeam : game.awayTeam;
    const statusState: SimulationForm['statusState'] = 'in';
    const period = preset === 'halftime' ? '2' : form.period || '1';
    const clock = preset === 'halftime' ? '0:00' : form.clock || '7:34';
    const downDistance = situation.shortDownDistance && situation.possessionText
      ? `${situation.shortDownDistance} at ${situation.possessionText}`
      : '';
    const next = {
      ...form,
      statusState,
      period,
      clock,
      possession,
      downDistance,
      situation,
      awayScore: form.awayScore || '14',
      homeScore: form.homeScore || '17',
      awayScoreQ1: form.awayScoreQ1 || '7',
      awayScoreQ2: form.awayScoreQ2 || '7',
      homeScoreQ1: form.homeScoreQ1 || '10',
      homeScoreQ2: form.homeScoreQ2 || '7',
    };
    setForm(next);
    void save(next, `${preset.replace('-', ' ')} scenario loaded`);
  };

  const updateSituation = <K extends keyof SandboxGamecastSituation>(key: K, value: SandboxGamecastSituation[K]) => {
    setForm((current) => ({ ...current, situation: { ...current.situation, [key]: value } }));
  };

  const quarterFields = [1, 2, 3, 4] as const;

  return (
    <details className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-emerald-300">Live Gamecast controls</summary>
      <div className="mt-3 space-y-4">
        <p className="text-xs text-slate-400">Every scenario includes sample Box Score and Team Stats data; production live games use ESPN&apos;s game summary.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" type="button" onClick={() => setStatusAndSave('in')} disabled={saving} className="gap-1 bg-red-600 hover:bg-red-700">
            <Radio className="h-3.5 w-3.5" /> Start Game
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={() => setStatusAndSave('pre')} disabled={saving} className="gap-1">
            <Play className="h-3.5 w-3.5" /> Scheduled
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={() => setStatusAndSave('post')} disabled={saving} className="gap-1 border-green-600/50 text-green-300">
            <Square className="h-3.5 w-3.5" /> Mark Final
          </Button>
        </div>

        <div>
          <Label className="mb-1.5 block text-xs text-slate-300">Instant scenarios</Label>
          <div className="flex flex-wrap gap-2">
            {([
              ['normal', 'Normal drive'],
              ['red-zone', 'Red zone'],
              ['goal-to-go', 'Goal to go'],
              ['halftime', 'Halftime'],
              ['feed-unavailable', 'Missing feed'],
            ] as Array<[SandboxGamecastPreset, string]>).map(([preset, label]) => (
              <Button key={preset} size="sm" type="button" variant="secondary" disabled={saving} onClick={() => applyPreset(preset)} className="text-xs">
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><Label className="text-xs">Away score</Label><Input type="number" min="0" max="200" value={form.awayScore} onChange={(event) => setForm({ ...form, awayScore: event.target.value })} /></div>
          <div><Label className="text-xs">Home score</Label><Input type="number" min="0" max="200" value={form.homeScore} onChange={(event) => setForm({ ...form, homeScore: event.target.value })} /></div>
          <div><Label className="text-xs">Quarter</Label><select value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option><option value="5">OT</option></select></div>
          <div><Label className="text-xs">Clock</Label><Input value={form.clock} placeholder="7:34" onChange={(event) => setForm({ ...form, clock: event.target.value })} /></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><Label className="text-xs">Possession</Label><select value={form.possession} onChange={(event) => setForm({ ...form, possession: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value={game.awayTeam}>{game.awayTeam}</option><option value={game.homeTeam}>{game.homeTeam}</option></select></div>
          <div><Label className="text-xs">Short down</Label><Input value={form.situation.shortDownDistance ?? ''} placeholder="3rd & 7" onChange={(event) => updateSituation('shortDownDistance', event.target.value || null)} /></div>
          <div><Label className="text-xs">Ball on</Label><Input value={form.situation.possessionText ?? ''} placeholder={`${game.homeTeam} 16`} onChange={(event) => updateSituation('possessionText', event.target.value || null)} /></div>
          <div><Label className="text-xs">Full down text</Label><Input value={form.downDistance} placeholder="3rd & 7 at LV 16" onChange={(event) => setForm({ ...form, downDistance: event.target.value })} /></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label className="text-xs">Field position (0–100)</Label><Input type="number" min="0" max="100" value={form.situation.yardLine ?? ''} onChange={(event) => updateSituation('yardLine', event.target.value === '' ? null : Number(event.target.value))} /></div>
          <div><Label className="text-xs">Distance to gain</Label><Input type="number" min="0" max="99" value={form.situation.distance ?? ''} onChange={(event) => updateSituation('distance', event.target.value === '' ? null : Number(event.target.value))} /></div>
          <label className="mt-5 flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm"><input type="checkbox" checked={form.situation.isRedZone} onChange={(event) => updateSituation('isRedZone', event.target.checked)} /> Red zone</label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label className="text-xs">Drive summary</Label><Input value={form.situation.driveSummary ?? ''} placeholder="6 plays, 59 yards, 3:18" onChange={(event) => updateSituation('driveSummary', event.target.value || null)} /></div>
          <div><Label className="text-xs">Last play</Label><textarea value={form.situation.lastPlayText ?? ''} onChange={(event) => updateSituation('lastPlayText', event.target.value || null)} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        </div>

        <details className="rounded-md border border-border p-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-300">Quarter-by-quarter scoring</summary>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {quarterFields.map((quarter) => <div key={`away-${quarter}`}><Label className="text-[10px]">{game.awayTeam} Q{quarter}</Label><Input type="number" min="0" value={form[`awayScoreQ${quarter}`]} onChange={(event) => setForm({ ...form, [`awayScoreQ${quarter}`]: event.target.value })} /></div>)}
            {quarterFields.map((quarter) => <div key={`home-${quarter}`}><Label className="text-[10px]">{game.homeTeam} Q{quarter}</Label><Input type="number" min="0" value={form[`homeScoreQ${quarter}`]} onChange={(event) => setForm({ ...form, [`homeScoreQ${quarter}`]: event.target.value })} /></div>)}
          </div>
        </details>

        <Button type="button" onClick={() => void save()} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Gamecast'}
        </Button>
      </div>
    </details>
  );
}
