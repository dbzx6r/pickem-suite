import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import { SessionProvider } from 'next-auth/react';
import { auth } from '@/lib/auth';
import { SandboxProvider } from '@/contexts/SandboxContext';
import SandboxBanner from '@/components/SandboxBanner';
import FloatingChat from '@/components/FloatingChat';
import PWARegister from '@/components/PWARegister';
import { prisma } from '@/lib/prisma';
import { NFL_TEAMS } from '@/lib/espn';
import { teamPalette } from '@/lib/themes';


export const metadata: Metadata = {
  title: 'Pickem Suite | Weekly Football Picks',
  description: 'Compete with friends on NFL weekly picks',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pickem Suite',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0f1e',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const [userPrefs, settings] = await Promise.all([
    session?.user?.id ? prisma.user.findUnique({ where: { id: session.user.id }, select: { profile: { select: { theme: true, favoriteTeam: true, reducedMotion: true } } } }) : null,
    prisma.leagueSettings.findUnique({ where: { id: 'default' }, select: { chatEnabled: true } }),
  ]);
  const theme = userPrefs?.profile?.theme ?? 'midnight';
  const teamColor = theme === 'team' && userPrefs?.profile?.favoriteTeam ? NFL_TEAMS[userPrefs.profile.favoriteTeam]?.color : null;

  return (
    <html lang="en" data-theme={theme} data-reduced-motion={userPrefs?.profile?.reducedMotion ? 'true' : 'false'} style={teamColor ? teamPalette(teamColor) as React.CSSProperties : undefined} suppressHydrationWarning>
      <body className={'min-h-screen'}>
        <SessionProvider session={session}>
          <SandboxProvider>
            <SandboxBanner />
            {children}
            {settings?.chatEnabled !== false && <FloatingChat />}
            <PWARegister />
            <Toaster position="top-right" toastOptions={{ style: { background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))', borderColor: 'hsl(var(--border))' } }} />
          </SandboxProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
