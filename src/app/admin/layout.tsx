import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Link from 'next/link';
import { Users, Calendar, Gamepad2, Megaphone, BarChart3, FlaskConical, Calculator, ScrollText, HeartPulse, SlidersHorizontal, BellRing } from 'lucide-react';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id as string } }),
    prisma.leagueSettings.findUnique({ where: { id: 'default' }, select: { leagueName: true } }),
  ]);
  if (user?.role !== 'ADMIN') redirect('/');

  const navUser = {
    id: session.user.id as string,
    email: session.user.email as string,
    name: session.user.name,
    role: 'ADMIN',
  };

  return (
    <div className="min-h-screen">
      <Navigation user={navUser} leagueName={settings?.leagueName ?? 'NFL Picks'} />
      <div className="mx-auto w-full min-w-0 max-w-7xl px-3 py-5 sm:px-4 sm:py-6">
        <div className="mb-6 flex min-w-0 items-center gap-3">
          <span className="text-yellow-500 text-2xl">⚙️</span>
          <h1 className="min-w-0 text-xl font-bold sm:text-2xl">Commissioner Panel</h1>
        </div>
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { href: '/admin', label: 'Overview', icon: BarChart3 },
            { href: '/admin/users', label: 'Users', icon: Users },
            { href: '/admin/weeks', label: 'Weeks', icon: Calendar },
            { href: '/admin/scoring', label: 'Scoring', icon: Calculator },
            { href: '/admin/games', label: 'Games', icon: Gamepad2 },
            { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
            { href: '/admin/sandbox', label: 'Sandbox', icon: FlaskConical },
            { href: '/admin/settings', label: 'Settings', icon: SlidersHorizontal },
            { href: '/admin/reminders', label: 'Reminders', icon: BellRing },
            { href: '/admin/audit', label: 'Audit', icon: ScrollText },
            { href: '/admin/health', label: 'Health', icon: HeartPulse },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/50 hover:bg-accent transition-colors text-sm border border-border cursor-pointer">
                <Icon className="h-4 w-4" />
                {label}
              </div>
            </Link>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
