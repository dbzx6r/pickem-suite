'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Bell } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((response) => response.json());
export default function NotificationBell() {
  const { data, mutate } = useSWR<{ unread: number }>('/api/notifications', fetcher, { refreshInterval: 15_000, refreshWhenHidden: false });
  useEffect(() => {
    const refresh = () => void mutate();
    window.addEventListener('nfl:notifications-updated', refresh);
    return () => window.removeEventListener('nfl:notifications-updated', refresh);
  }, [mutate]);
  const unread = data?.unread ?? 0;
  return <Link href="/notifications" className="relative flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md hover:bg-accent" aria-label={`${unread} unread notifications`}><Bell className="h-4 w-4" />{unread > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}</Link>;
}
