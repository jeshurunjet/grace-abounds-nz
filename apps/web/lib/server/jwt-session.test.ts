// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    set: (name: string, value: string) => jar.set(name, value),
  }),
  headers: async () =>
    new Headers({
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    }),
}));

process.env.AUTH_GOOGLE_ID ??= 'test-google-client';
process.env.AUTH_GOOGLE_SECRET ??= 'test-google-secret';
const { authConfig } = await import('../../auth');
const { setIntent } = await import('./sessions');
// Callback parameter types are wide; tests pass only what each path reads.
const callbacks = authConfig.callbacks as unknown as {
  jwt: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
  signIn: (args: Record<string, unknown>) => Promise<boolean | string>;
};
const events = authConfig.events as unknown as {
  signOut: (args: Record<string, unknown>) => Promise<void>;
};

describe.skipIf(!dbTestsEnabled)(
  'Auth.js JWT sessions and sign-in rules (PostgreSQL)',
  () => {
    beforeEach(async () => {
      await resetIdentityTables();
      jar.clear();
    });
    afterAll(() => prisma.$disconnect());

    const firstSignIn = (
      user: { id: string; email: string },
      provider: string,
    ) =>
      callbacks.jwt({
        token: {},
        user: { id: user.id, email: user.email, name: null, image: null },
        account: { provider, type: 'x', providerAccountId: user.id },
      });

    it.each(['password', 'email-code', 'google', 'passkey'])(
      '%s: first sign-in records a session; later reads validate it',
      async (provider) => {
        const user = await createUser({ role: 'ADMIN' });
        const token = await firstSignIn(user, provider);
        expect(token).toMatchObject({ sub: user.id, sv: 1 });
        const row = await prisma.userSession.findUniqueOrThrow({
          where: { id: String(token!.sid) },
        });
        expect(row).toMatchObject({
          userId: user.id,
          method: provider,
          deviceLabel: 'Chrome on macOS',
        });
        const read = await callbacks.jwt({ token });
        expect(read).toMatchObject({ sub: user.id, role: 'admin' });
        // Role changes are picked up on the next read.
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'MEMBER' },
        });
        expect(await callbacks.jwt({ token })).toMatchObject({
          role: 'member',
        });
        await prisma.userSession.update({
          where: { id: row.id },
          data: { revokedAt: new Date() },
        });
        expect(await callbacks.jwt({ token })).toBeNull();
      },
    );

    it('rejects a token whose session was ended by a password reset', async () => {
      const user = await createUser();
      const token = await firstSignIn(user, 'password');
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
      });
      expect(await callbacks.jwt({ token })).toBeNull();
    });

    it('linking from Settings keeps the current session; a revoked one is never revived', async () => {
      const user = await createUser();
      const current = await createSession(user.id);
      await setIntent('google', user.id, current.id);
      const linked = await firstSignIn(user, 'google');
      expect(linked!.sid).toBe(current.id);
      await prisma.userSession.update({
        where: { id: current.id },
        data: { revokedAt: new Date() },
      });
      const again = await firstSignIn(user, 'google');
      expect(again!.sid).not.toBe(current.id);
      expect(
        (
          await prisma.userSession.findUniqueOrThrow({
            where: { id: current.id },
          })
        ).revokedAt,
      ).not.toBeNull();
    });

    it('suspended accounts cannot start a session', async () => {
      const user = await createUser({ status: 'SUSPENDED' });
      await expect(firstSignIn(user, 'email-code')).rejects.toThrow();
      expect(
        await callbacks.signIn({
          user: { email: user.email },
          account: { provider: 'email-code' },
        }),
      ).toBe(false);
    });

    it('sign-out revokes the session record', async () => {
      const user = await createUser();
      const token = await firstSignIn(user, 'password');
      await events.signOut({ token });
      expect(await callbacks.jwt({ token })).toBeNull();
    });

    describe('Google rules', () => {
      const google = (email: string, sub: string, verified = true) =>
        callbacks.signIn({
          user: { email },
          account: { provider: 'google', providerAccountId: sub },
          profile: { email, email_verified: verified },
        });

      it('creates new Members only for a verified, unused email', async () => {
        expect(await google('new@example.test', 'g-new')).toBe(true);
        expect(await google('unverified@example.test', 'g-u', false)).toBe(
          '/login?error=GoogleEmailUnverified',
        );
      });

      it('never links an existing account by email match', async () => {
        const user = await createUser();
        expect(await google(user.email, 'g-match')).toBe(
          '/login?error=OAuthAccountNotLinked',
        );
        expect(await prisma.account.count()).toBe(0);
      });

      it('signs in an already linked Google account; refuses it when suspended', async () => {
        const user = await createUser();
        await prisma.account.create({
          data: {
            userId: user.id,
            type: 'oidc',
            provider: 'google',
            providerAccountId: 'g-linked',
          },
        });
        expect(await google('any@example.test', 'g-linked')).toBe(true);
        await prisma.user.update({
          where: { id: user.id },
          data: { status: 'SUSPENDED' },
        });
        expect(await google('any@example.test', 'g-linked')).toBe(false);
      });

      it('with a Settings intent, links; but not a Google account owned by someone else', async () => {
        const user = await createUser();
        const other = await createUser();
        const row = await createSession(user.id);
        await setIntent('google', user.id, row.id);
        expect(await google('whatever@example.test', 'g-fresh')).toBe(true);
        await prisma.account.create({
          data: {
            userId: other.id,
            type: 'oidc',
            provider: 'google',
            providerAccountId: 'g-other',
          },
        });
        expect(await google('whatever@example.test', 'g-other')).toBe(
          '/settings?error=GoogleLinkedElsewhere',
        );
      });
    });
  },
);
