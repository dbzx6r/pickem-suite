'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { NFL_TEAMS } from '@/lib/espn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function ManualGameForm({ weeks, onCreated }: { weeks: Array<{id:string; label:string}>; onCreated:()=>void }) {
  const [busy,setBusy]=useState(false);
  return <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={async event=>{
    event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); setBusy(true);
    try {
      const response=await fetch('/api/admin/games',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create_game',weekId:data.get('weekId'),homeTeam:data.get('homeTeam'),awayTeam:data.get('awayTeam'),startTime:new Date(String(data.get('startTime'))).toISOString(),venue:data.get('venue')})});
      const result=await response.json(); if(!response.ok) throw new Error(result.error || 'Could not create game');
      toast.success('Game created'); form.reset(); onCreated();
    } catch(error){toast.error(error instanceof Error?error.message:'Could not create game');} finally{setBusy(false);}
  }}>
    <h2 className="font-bold">Add a game manually</h2><p className="text-sm text-muted-foreground">Create a week first. Kickoff uses your browser’s local time. No external feed is needed.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Week<select name="weekId" required className="mt-1 block w-full rounded-md border border-border bg-background p-2"><option value="">Select week</option>{weeks.map(week=><option key={week.id} value={week.id}>{week.label}</option>)}</select></label>
      {['awayTeam','homeTeam'].map((name)=><label className="text-sm" key={name}>{name==='homeTeam'?'Home team':'Away team'}<select name={name} required className="mt-1 block w-full rounded-md border border-border bg-background p-2"><option value="">Select team</option>{Object.entries(NFL_TEAMS).map(([abbr,team])=><option value={abbr} key={abbr}>{abbr} — {team.name}</option>)}</select></label>)}
      <label className="text-sm">Kickoff<Input name="startTime" type="datetime-local" required /></label>
      <label className="text-sm">Venue (optional)<Input name="venue" maxLength={200}/></label>
    </div><Button disabled={busy || !weeks.length} type="submit">{busy?'Adding…':'Add game'}</Button>
  </form>;
}
