import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Navigation from '@/components/Navigation';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const [dbUser, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id as string }, include: { profile: true } }),
    prisma.leagueSettings.findUnique({ where: { id: 'default' }, select: { leagueName: true } }),
  ]);

  const user = {
    id: session.user.id as string,
    email: session.user.email as string,
    name: session.user.name,
    role: (session.user as { role?: string }).role ?? 'USER',
    avatarUrl: dbUser?.profile?.avatarUrl ?? null,
  };

  return (
    <div className="min-h-screen">
      <Navigation user={user} leagueName={settings?.leagueName ?? 'NFL Picks'} />
      <main className="mx-auto w-full min-w-0 max-w-7xl px-3 py-5 sm:px-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
