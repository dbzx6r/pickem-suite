import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { nextUrl, auth: session } = req as typeof req & { auth: { user?: { mustChangePassword?: boolean } } | null };

  const path = nextUrl.pathname;
  if (path.startsWith('/api/') && !path.startsWith('/api/auth/') && !path.startsWith('/api/cron/') && !path.startsWith('/api/automation/') && !path.startsWith('/api/v1/')) {
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.mustChangePassword && path !== '/api/user/change-password') return NextResponse.json({ error: 'Change your password first' }, { status: 403 });
  }
  if (session?.user?.mustChangePassword) {
    const isChangePwPage = nextUrl.pathname === '/change-password';
    const isApiRoute = nextUrl.pathname.startsWith('/api/');
    const isAuthRoute = nextUrl.pathname.startsWith('/api/auth/');

    if (!isChangePwPage && !isApiRoute && !isAuthRoute) {
      return NextResponse.redirect(new URL('/change-password', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
