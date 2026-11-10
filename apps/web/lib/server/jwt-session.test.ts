// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () =>
    new Headers({
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    }),
}));

process.env.AUTH_GOOGLE_ID ??= 'test-google-client';
process.env.AUTH_GOOGLE_SECRET ??= 'test-google-secret';
const { authConfig } = await import('../../auth');
const { runLinked } = await import('./sessions');
const { authorizePassword } = await import('./password-signin');
const { hashPassword } = await import('./password');
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

const PASSWORD = 'correct-horse-1';
const passwordRequest = new Request(
  'http://localhost:3000/api/auth/callback/password',
);

/** Gives the user a password and returns exactly what authorizePassword returns. */
async function passwordUser(user: { id: string; email: string }) {
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(PASSWORD) },
  });
  return authorizePassword(
    { email: user.email, password: PASSWORD },
    passwordRequest,
  );
}

const firstSignIn = async (
  user: { id: string; email: string },
  provider: string,
) =>
  callbacks.jwt({
    token: {},
    user:
      provider === 'password'
        ? await passwordUser(user)
        : { id: user.id, email: user.email, name: null, image: null },
    account: { provider, type: 'x', providerAccountId: user.id },
  });

describe.skipIf(!dbTestsEnabled)(
  'Auth.js JWT sessions and sign-in rules (PostgreSQL)',
  () => {
    beforeEach(resetIdentityTables);
    afterAll(() => prisma.$disconnect());

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
        expect(await callbacks.jwt({ token })).toMatchObject({
          sub: user.id,
          role: 'admin',
        });
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

    it('a password check made before a reset cannot become a session', async () => {
      const user = await createUser();
      const authorized = await passwordUser(user);
      // The reset lands between verification and session creation.
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword('recovered-pass-1'),
          sessionVersion: { increment: 1 },
        },
      });
      const sessions = await prisma.userSession.count();
      await expect(
        callbacks.jwt({
          token: {},
          user: authorized,
          account: { provider: 'password' },
        }),
      ).rejects.toThrow('no longer current');
      expect(await prisma.userSession.count()).toBe(sessions);
      // Fresh proof with the new password succeeds.
      const fresh = await authorizePassword(
        { email: user.email, password: 'recovered-pass-1' },
        passwordRequest,
      );
      expect(
        await callbacks.jwt({
          token: {},
          user: fresh,
          account: { provider: 'password' },
        }),
      ).toMatchObject({ sub: user.id, sv: 2 });
    });

    it('a password check made before a Settings password change is refused too', async () => {
      const user = await createUser();
      const authorized = await passwordUser(user);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword('changed-pass-1') },
      });
      await expect(
        callbacks.jwt({
          token: {},
          user: authorized,
          account: { provider: 'password' },
        }),
      ).rejects.toThrow('no longer current');
    });

    it('password sessions need server proof; session updates cannot supply identity', async () => {
      const user = await createUser();
      await expect(
        callbacks.jwt({
          token: {},
          user: { id: user.id, email: user.email },
          account: { provider: 'password' },
        }),
      ).rejects.toThrow();
      const token = await firstSignIn(user, 'email-code');
      const updated = await callbacks.jwt({
        token,
        trigger: 'update',
        session: {
          sid: 'forged',
          sv: 99,
          passwordProof: { sessionVersion: 99 },
        },
      });
      expect(updated).toMatchObject({ sid: token!.sid, sv: token!.sv });
    });

    it('linking keeps the current session; a revoked one fails closed and is never revived', async () => {
      const user = await createUser();
      const current = await createSession(user.id);
      const link = { userId: user.id, sessionId: current.id };
      const linked = await runLinked(link, () => firstSignIn(user, 'google'));
      expect(linked!.sid).toBe(current.id);
      await prisma.userSession.update({
        where: { id: current.id },
        data: { revokedAt: new Date() },
      });
      const before = await prisma.userSession.count();
      await expect(
        runLinked(link, () => firstSignIn(user, 'google')),
      ).rejects.toThrow();
      expect(await prisma.userSession.count()).toBe(before);
      // An ordinary sign-in (no linking context) still creates a fresh session.
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

    it('linking fails closed when the linking session is no longer recently authenticated', async () => {
      const user = await createUser();
      const stale = await createSession(user.id, {
        authenticatedAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      await expect(
        runLinked({ userId: user.id, sessionId: stale.id }, () =>
          firstSignIn(user, 'passkey'),
        ),
      ).rejects.toThrow();
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
      const token = await firstSignIn(user, 'email-code');
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

      it('in a linking context, links; but not a Google account owned by someone else', async () => {
        const user = await createUser();
        const other = await createUser();
        const row = await createSession(user.id);
        const link = { userId: user.id, sessionId: row.id };
        expect(
          await runLinked(link, () =>
            google('whatever@example.test', 'g-fresh'),
          ),
        ).toBe(true);
        await prisma.account.create({
          data: {
            userId: other.id,
            type: 'oidc',
            provider: 'google',
            providerAccountId: 'g-other',
          },
        });
        expect(
          await runLinked(link, () =>
            google('whatever@example.test', 'g-other'),
          ),
        ).toBe('/settings?error=GoogleLinkedElsewhere');
      });

      it('an intent cookie alone (no verified linking context) does not enable linking', async () => {
        const user = await createUser();
        expect(await google(user.email, 'g-cookie-only')).toBe(
          '/login?error=OAuthAccountNotLinked',
        );
      });
    });
  },
);
