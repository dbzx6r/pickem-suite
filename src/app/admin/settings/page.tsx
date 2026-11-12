'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Settings = { leagueName: string; pickWindowWeeks: number; registrationEnabled: boolean; chatEnabled: boolean; reminderHours: number; reminderMinutes: string; newsEnabled: boolean };
export default function LeagueSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => { fetch('/api/admin/settings').then((r) => r.json()).then((d) => setSettings(d.settings)); }, []);
  if (!settings) return <p>Loading settings…</p>;
  const save = async () => { const response = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }); response.ok ? toast.success('League settings saved') : toast.error('Settings could not be saved'); };
  return <Card className="glass-card border-border"><CardHeader><CardTitle>League Settings</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="leagueName">League name</Label><Input id="leagueName" value={settings.leagueName} onChange={(e) => setSettings({ ...settings, leagueName: e.target.value })} /></div><div><Label htmlFor="window">Weeks open ahead (1–4)</Label><Input id="window" type="number" min={1} max={4} value={settings.pickWindowWeeks} onChange={(e) => setSettings({ ...settings, pickWindowWeeks: Number(e.target.value) })} /></div><div><Label htmlFor="reminder">Legacy reminder lead (hours)</Label><Input id="reminder" type="number" min={1} max={168} value={settings.reminderHours} onChange={(e) => setSettings({ ...settings, reminderHours: Number(e.target.value) })} /></div><div><Label htmlFor="reminderMinutes">Push reminder minutes</Label><Input id="reminderMinutes" value={settings.reminderMinutes} onChange={(e) => setSettings({ ...settings, reminderMinutes: e.target.value })} placeholder="1440,60,15" /><p className="mt-1 text-xs text-muted-foreground">Comma-separated lead times from 5 to 10080 minutes. The required 60-minute reminder is always included.</p></div><div className="space-y-2 pt-5"><label className="flex gap-2"><input type="checkbox" checked={settings.registrationEnabled} onChange={(e) => setSettings({ ...settings, registrationEnabled: e.target.checked })} />Allow public registration</label><label className="flex gap-2"><input type="checkbox" checked={settings.chatEnabled} onChange={(e) => setSettings({ ...settings, chatEnabled: e.target.checked })} />Enable chat</label><label className="flex gap-2"><input type="checkbox" checked={settings.newsEnabled} onChange={(e) => setSettings({ ...settings, newsEnabled: e.target.checked })} />Enable news</label></div><p className="text-xs text-muted-foreground sm:col-span-2">Pick reveal policy is fixed to individual game kickoff to protect unrevealed selections.</p><Button onClick={save} className="w-fit">Save settings</Button></CardContent></Card>;
}
