import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, clearRateLimit, clientAddress, rateLimitKey } from '@/lib/rateLimit';
import { normalizeEmail } from '@/lib/security';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = normalizeEmail(credentials.email);
        const ipKey = rateLimitKey('login-ip', clientAddress(request));
        const emailKey = rateLimitKey('login-email', email);
        const [ipLimit, emailLimit] = await Promise.all([
          checkRateLimit(ipKey, { maxRequests: 20, windowMs: 15 * 60_000 }),
          checkRateLimit(emailKey, { maxRequests: 8, windowMs: 15 * 60_000 }),
        ]);
        if (!ipLimit.allowed || !emailLimit.allowed) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { profile: true },
        });

        if (!user) return null;
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!passwordMatch) {
          const attempts = user.failedLoginAttempts + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: attempts,
              lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
            },
          });
          return null;
        }

        await Promise.all([
          prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
          }),
          clearRateLimit(emailKey),
        ]);

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          sessionVersion: user.sessionVersion,
          name: user.profile?.displayName ?? user.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { id: string; role: string }).role;
        token.mustChangePassword = (user as { id: string; mustChangePassword: boolean }).mustChangePassword;
        token.sessionVersion = (user as { sessionVersion: number }).sessionVersion;
      } else if (token.id) {
        const current = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, mustChangePassword: true, sessionVersion: true },
        });
        if (!current || current.sessionVersion !== token.sessionVersion) return null;
        token.role = current.role;
        token.mustChangePassword = current.mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
        session.user.sessionVersion = token.sessionVersion as number;
      }
      return session;
    },
  },
});
