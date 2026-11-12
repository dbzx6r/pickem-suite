'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Row = { userId: string; displayName: string; complete: boolean; missing: Array<{ id: string; matchup: string; locksAt: string }>; pushEligible: boolean; lastSent: { createdAt: string; status: string } | null };
type Data = { week: { id: string; weekNumber: number; totalOpenGames: number } | null; participants: Row[] };

export default function ReminderCenterPage() {
  const [data, setData] = useState<Data | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const load = () => fetch('/api/admin/reminders').then((response) => response.json()).then(setData);
  useEffect(() => { void load(); }, []);
  const send = async (userIds: string[], key: string) => {
    setSending(key);
    const response = await fetch('/api/admin/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds }) });
    const result = await response.json();
    response.ok ? toast.success(`Reminder sent to ${result.sent}`) : toast.error(result.error || 'Reminder failed');
    await load();
    setSending(null);
  };
  if (!data) return <p>Loading reminder center…</p>;
  if (!data.week) return <p>No active week is available.</p>;
  const incomplete = data.participants.filter((participant) => !participant.complete);
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black">Commissioner Reminder Center</h1><p className="text-sm text-muted-foreground">Week {data.week.weekNumber} completion only—saved choices are never shown.</p></div><Button disabled={!incomplete.length || sending !== null} onClick={() => void send(incomplete.map((participant) => participant.userId), 'all')}><BellRing className="mr-2 h-4 w-4" />Remind all incomplete</Button></div><div className="grid gap-3">{data.participants.map((participant) => <Card key={participant.userId} className="glass-card border-border"><CardHeader className="pb-2"><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">{participant.displayName}</CardTitle>{participant.complete ? <Badge className="bg-emerald-500/20 text-emerald-300"><CheckCircle2 className="mr-1 h-3 w-3" />Complete</Badge> : <Badge variant="outline">{participant.missing.length} missing</Badge>}</div></CardHeader><CardContent className="space-y-2"><div className="flex flex-wrap gap-1">{participant.missing.map((game) => <Badge key={game.id} variant="outline">{game.matchup}</Badge>)}</div><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{participant.pushEligible ? 'Push eligible' : 'In-app reminder only'} · Last sent: {participant.lastSent ? `${new Date(participant.lastSent.createdAt).toLocaleString()} (${participant.lastSent.status})` : 'Never'}</span>{!participant.complete && <Button size="sm" variant="outline" disabled={sending !== null} onClick={() => void send([participant.userId], participant.userId)}><Send className="mr-1 h-3 w-3" />Remind</Button>}</div></CardContent></Card>)}</div></div>;
}
