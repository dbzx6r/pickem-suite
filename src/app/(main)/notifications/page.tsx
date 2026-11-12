'use client';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Notice = { id: string; title: string; message: string; href: string | null; readAt: string | null; createdAt: string };
const fetcher = (url: string) => fetch(url).then((response) => response.json());
export default function NotificationsPage() {
  const router = useRouter();
  const { data, mutate, isLoading } = useSWR<{ notifications: Notice[]; unread: number }>('/api/notifications', fetcher);
  const markAll = async () => { await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }); await mutate(); };
  const openNotice = async (notice: Notice) => {
    if (!notice.readAt) {
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: notice.id }) });
      window.dispatchEvent(new Event('nfl:notifications-updated'));
    }
    router.push(notice.href || '/notifications');
  };
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-black gradient-text sm:text-3xl">Notifications</h1><p className="text-muted-foreground">Pick reminders and league activity.</p></div><Button className="shrink-0" variant="outline" onClick={markAll} disabled={!data?.unread}>Mark all read</Button></div>{isLoading && <p>Loading…</p>}<div className="space-y-2">{data?.notifications.map((notice) => <Card key={notice.id} className={`glass-card ${notice.readAt ? 'opacity-70' : 'border-primary/30'}`}><CardContent className="p-4"><div className="flex flex-wrap justify-between gap-3"><div className="min-w-0 flex-1"><p className="break-words font-bold">{notice.title}</p><p className="break-words text-sm text-muted-foreground">{notice.message}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleString()}</p></div>{notice.href && <button type="button" className="shrink-0 text-sm font-semibold text-primary" onClick={() => void openNotice(notice)}>Open</button>}</div></CardContent></Card>)}</div>{data && data.notifications.length === 0 && <p className="py-10 text-center text-muted-foreground">No notifications yet.</p>}</div>;
}
