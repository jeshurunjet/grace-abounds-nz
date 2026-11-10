import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Passkey from 'next-auth/providers/passkey';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { normalizeEmail, prisma, recordAudit } from '@grace-abounds/database';
import { randomInt } from 'node:crypto';
import { CODE_LIMITS } from './lib/server/auth-limits';
import { sendSignInCode } from './lib/server/send-code';

export type AppRole = 'member' | 'pastor' | 'admin';

const secret = process.env.AUTH_SECRET;
if (!secret && process.env.NODE_ENV === 'production')
  throw new Error('AUTH_SECRET must be set in production.');

/**
 * Development accounts keep their existing demo profile pages. Every other
 * account uses its own user ID as its profile ID.
 */
const legacyProfileIds: Record<string, string> = {
  'member@example.org': 'member-michael-tane',
  'pastor@example.org': 'pastor-bartolome-sanchez',
  'admin@example.org': 'admin-maria-santos',
};

/** Email sign-in with a six-digit code instead of a magic link. */
const emailCode = {
  id: 'email-code',
  type: 'email' as const,
  name: 'Email code',
  from: process.env.EMAIL_FROM ?? 'Grace Abounds <no-reply@localhost>',
  maxAge: CODE_LIMITS.maxAgeSeconds,
  options: {},
  generateVerificationToken: () =>
    String(randomInt(0, 1_000_000)).padStart(6, '0'),
  normalizeIdentifier: (identifier: string) => normalizeEmail(identifier),
  sendVerificationRequest: sendSignInCode,
};

const providers: NextAuthConfig['providers'] = [emailCode, Passkey];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
  providers.push(
    Google({
      // Lets a fixed staff account (created by staff:add) sign in with
      // Google. The signIn callback only allows it for Google-verified emails.
      allowDangerousEmailAccountLinking: true,
    }),
  );

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: secret ?? 'development-only-secret-not-for-production',
  trustHost: true,
  pages: { signIn: '/login', verifyRequest: '/verify-email', error: '/login' },
  session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60 },
  experimental: { enableWebAuthn: true },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google' && profile?.email_verified !== true)
        return false;
      const email = user.email ? normalizeEmail(user.email) : '';
      if (!email) return false;
      const existing = await prisma.user.findUnique({ where: { email } });
      // Suspended or closing accounts cannot start new sessions.
      return !existing || existing.status === 'ACTIVE';
    },
    async session({ session, user }) {
      const record = user as unknown as {
        id: string;
        email: string;
        role: 'MEMBER' | 'ADMIN' | 'PASTOR';
      };
      session.user.id = record.id;
      session.user.role = record.role.toLowerCase() as AppRole;
      session.user.profileId = legacyProfileIds[record.email] ?? record.id;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id)
        await recordAudit(prisma, {
          actorId: user.id,
          action: 'member.signed_up',
          entityType: 'User',
          entityId: user.id,
        });
    },
    async signIn({ user, account }) {
      if (user.id)
        await recordAudit(prisma, {
          actorId: user.id,
          action: 'session.signed_in',
          entityType: 'User',
          entityId: user.id,
          metadata: { provider: account?.provider ?? 'unknown' },
        });
    },
  },
});
