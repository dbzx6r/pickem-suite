'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { weekLabel, rememberedWeek, WeekLabelInput } from '@/lib/week-labels';
type Context = { weeks: WeekLabelInput[]; seasonId: string; viewerId: string };
export default function WeekNavigator({ selected }: { selected?: number }) {
  const [data,setData]=useState<Context|null>(null);
  const [saved,setSaved]=useState<WeekLabelInput|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/weeks/list',{signal:controller.signal}).then(r=>r.ok?r.json():null).then((d:Context|null)=>{
      if (!d?.seasonId || controller.signal.aborted) return;
      setData(d);
      try { const key=`nfl:last-week:${d.viewerId}:${d.seasonId}`; setSaved(rememberedWeek(localStorage.getItem(key),d.weeks)); if(selected && d.weeks.some(w=>w.weekNumber===selected)) localStorage.setItem(key,String(selected)); } catch { /* Private browsing can disable storage. */ }
    }).catch(()=>undefined);
    return ()=>controller.abort();
  },[selected]);
  if(!data?.weeks.length) return null;
  const current=data.weeks.find(w=>!w.isFinal);
  if(!selected) return <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">{current && <a className="font-semibold text-primary underline underline-offset-4" href={`/picks/${current.weekNumber}`}>Current week · Week {current.weekNumber}</a>}{saved && saved.weekNumber!==current?.weekNumber && <a className="text-muted-foreground underline underline-offset-4" href={`/picks/${saved.weekNumber}`}>Continue viewing Week {saved.weekNumber} · {weekLabel(saved,data.weeks)}</a>}</div>;
  return <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm">Viewing<select aria-label="Viewing week" value={selected} className="min-h-11 max-w-full rounded-lg border bg-card px-3 text-base" onChange={e=>window.location.assign(`/picks/${e.target.value}`)}>{data.weeks.map(w=><option key={w.weekNumber} value={w.weekNumber}>Week {w.weekNumber} · {weekLabel(w,data.weeks)}</option>)}</select></label>{current && current.weekNumber!==selected && <a href={`/picks/${current.weekNumber}`} className="text-sm text-primary underline">Back to current week</a>}<Link href="/picks" className="text-sm text-muted-foreground underline">All weeks</Link></div>;
}
