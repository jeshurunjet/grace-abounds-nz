import NextAuth, { type NextAuthConfig } from 'next-auth';
import type { Adapter, AdapterAuthenticator } from 'next-auth/adapters';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import Passkey from 'next-auth/providers/passkey';
import { PrismaAdapter } from '@auth/prisma-adapter';
import {
  loadActiveSession,
  normalizeEmail,
  prisma,
  recordAudit,
  SESSION_MAX_AGE_SECONDS,
  type Prisma,
} from '@grace-abounds/database';
import { randomInt } from 'node:crypto';
import { emails, sendEmail } from './lib/server/email';
import { clientIp } from './lib/server/http';
import { allow, CODE_MAX_AGE_SECONDS } from './lib/server/limits';
import { authorizePassword } from './lib/server/password-signin';
import {
  currentLink,
  noteCreatedUser,
  persistAuthenticator,
  persistLinkedAccount,
  startSession,
  type PasswordProof,
} from './lib/server/sessions';

export type AppRole = 'member' | 'pastor' | 'admin';

const secret = process.env.AUTH_SECRET;
if (!secret) throw new Error('AUTH_SECRET must be set (see .env.example).');

/** Email sign-in with a six-digit code instead of a magic link. */
const emailCode = {
  id: 'email-code',
  type: 'email' as const,
  name: 'Email code',
  from: process.env.EMAIL_FROM ?? 'Grace Abounds <no-reply@localhost>',
  maxAge: CODE_MAX_AGE_SECONDS,
  options: {},
  generateVerificationToken: () =>
    String(randomInt(0, 1_000_000)).padStart(6, '0'),
  normalizeIdentifier: (identifier: string) => normalizeEmail(identifier),
  async sendVerificationRequest({
    identifier,
    token,
    request,
  }: {
    identifier: string;
    token: string;
    request: Request;
  }) {
    // Over-limit requests are dropped silently so responses never reveal
    // whether an address exists or is being throttled.
    if (!(await allow('codeRequestIp', clientIp(request)))) return;
    if (!(await allow('codeRequestEmail', identifier))) return;
    await sendEmail(emails.signInCode(identifier, token));
  },
};

const password = Credentials({
  id: 'password',
  name: 'Password',
  credentials: { email: {}, password: {} },
  authorize: (input, request) => authorizePassword(input, request),
});

const providers: NextAuthConfig['providers'] = [emailCode, password, Passkey];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
  // No automatic linking by email: an existing account links Google from
  // Settings while signed in (see the Google rules in the signIn callback).
  providers.push(Google);

/** Emails are stored normalized; the adapter must look them up the same way. */
const baseAdapter = PrismaAdapter(prisma);
const adapter: Adapter = {
  ...baseAdapter,
  async createUser(user) {
    const created = await baseAdapter.createUser!({
      ...user,
      email: normalizeEmail(user.email),
    });
    noteCreatedUser(created.id);
    return created;
  },
  getUserByEmail: (email) => baseAdapter.getUserByEmail!(normalizeEmail(email)),
  // Auth.js saves links and passkeys before the jwt callback runs, so the
  // linking authority is checked at the write itself (see sessions.ts).
  linkAccount: async (account) => {
    await persistLinkedAccount(account as Prisma.AccountUncheckedCreateInput);
  },
  createAuthenticator: async (authenticator) =>
    (await persistAuthenticator(
      authenticator as Prisma.AuthenticatorUncheckedCreateInput,
    )) as unknown as AdapterAuthenticator,
};

export const authConfig: NextAuthConfig = {
  adapter,
  secret,
  // AUTH_URL pins the site origin, so the incoming Host header is not used to
  // build callback URLs. AUTH_TRUST_HOST=true is only for hosts that set a
  // trusted Host header without AUTH_URL.
  trustHost:
    Boolean(process.env.AUTH_URL) || process.env.AUTH_TRUST_HOST === 'true',
  pages: { signIn: '/login', verifyRequest: '/verify-email', error: '/login' },
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  experimental: { enableWebAuthn: true },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        if (profile?.email_verified !== true)
          return '/login?error=GoogleEmailUnverified';
        const linked = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: 'google',
              providerAccountId: account.providerAccountId,
            },
          },
          select: { userId: true, user: { select: { status: true } } },
        });
        const link = currentLink();
        if (link) {
          // Linking from Settings (the route guard has already checked the
          // session and recent authentication).
          if (linked && linked.userId !== link.userId)
            return '/settings?error=GoogleLinkedElsewhere';
          return true;
        }
        if (linked) return linked.user.status === 'ACTIVE';
        const email = normalizeEmail(user.email ?? '');
        if (!email) return false;
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });
        // Existing accounts never gain Google by email match alone.
        if (existing) return '/login?error=OAuthAccountNotLinked';
        return true; // New Member account.
      }
      const email = user.email ? normalizeEmail(user.email) : '';
      if (!email) return false;
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { status: true },
      });
      // Suspended or closing accounts cannot start new sessions.
      return !existing || existing.status === 'ACTIVE';
    },
    async jwt({ token, user, account }) {
      if (user?.id && account) {
        // A real authentication just happened: record (or, for Settings
        // linking, keep) the server-side session.
        // Password sign-ins carry server-only proof from authorizePassword;
        // other providers never do.
        const proof =
          account.provider === 'password'
            ? ((user as { passwordProof?: PasswordProof }).passwordProof ??
              null)
            : null;
        const session = await startSession(user.id, account.provider, proof);
        return {
          sub: user.id,
          sid: session.id,
          sv: session.sessionVersion,
          name: user.name ?? null,
          email: user.email ?? null,
          picture: user.image ?? null,
        };
      }
      // Every later read (pages, the API gateway, useSession): the session
      // must still be valid in the database. Returning null signs out. A
      // database error throws, which Auth.js also treats as signed out.
      const row = await loadActiveSession(prisma, {
        userId: String(token.sub ?? ''),
        sessionId: String(token.sid ?? ''),
        sessionVersion: Number(token.sv),
      });
      if (!row) return null;
      token.role = row.user.role.toLowerCase() as AppRole;
      token.name = row.user.name;
      token.email = row.user.email;
      token.picture = row.user.image;
      return token;
    },
    async session({ session, token }) {
      session.user.id = String(token.sub);
      session.user.role = (token.role ?? 'member') as AppRole;
      session.user.profileId = String(token.sub);
      session.sessionId = String(token.sid);
      session.sessionVersion = Number(token.sv);
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
    async linkAccount({ user, account }) {
      if (user.id)
        await recordAudit(prisma, {
          actorId: user.id,
          action: 'account.provider_linked',
          entityType: 'User',
          entityId: user.id,
          metadata: { provider: account.provider },
        });
    },
    async signOut(message) {
      const token = 'token' in message ? message.token : null;
      if (token?.sid)
        await prisma.userSession.updateMany({
          where: { id: String(token.sid), revokedAt: null },
          data: { revokedAt: new Date() },
        });
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
