// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lockUserSecurity,
  prisma,
  revokeSessions,
} from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers({ 'user-agent': 'vitest' }),
}));

const { authConfig } = await import('../../auth');
const { runAuthRequest, runLinked, CredentialRefused } =
  await import('./sessions');
// The real adapter Auth.js uses; called here in Auth.js's own order.
const adapter = authConfig.adapter as unknown as {
  createUser: (user: Record<string, unknown>) => Promise<{ id: string }>;
  linkAccount: (account: Record<string, unknown>) => Promise<unknown>;
  createAuthenticator: (
    authenticator: Record<string, unknown>,
  ) => Promise<unknown>;
};

const googleAccount = (userId: string, sub: string) => ({
  userId,
  type: 'oidc',
  provider: 'google',
  providerAccountId: sub,
});
const passkeyAccount = (userId: string, credentialID: string) => ({
  userId,
  type: 'webauthn',
  provider: 'passkey',
  providerAccountId: credentialID,
});
const authenticator = (userId: string, credentialID: string) => ({
  userId,
  credentialID,
  providerAccountId: credentialID,
  credentialPublicKey: 'public-key',
  counter: 0,
  credentialDeviceType: 'singleDevice',
  credentialBackedUp: false,
  transports: 'internal',
});
const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000);

/** Every Google/passkey credential row that could later sign someone in. */
async function credentialsFor(userId: string) {
  return {
    accounts: await prisma.account.count({ where: { userId } }),
    authenticators: await prisma.authenticator.count({ where: { userId } }),
  };
}

describe.skipIf(!dbTestsEnabled)(
  'Google links and passkeys are only saved with live authority (PostgreSQL)',
  () => {
    beforeEach(resetIdentityTables);
    afterAll(() => prisma.$disconnect());

    async function linkingSession(options: { authenticatedAt?: Date } = {}) {
      const user = await createUser();
      const session = await createSession(user.id, options);
      return {
        user,
        session,
        link: { userId: user.id, sessionId: session.id },
      };
    }

    describe('Google linking (adapter.linkAccount)', () => {
      it('control: a valid, recently authenticated linking session saves the link', async () => {
        const { user, link } = await linkingSession();
        await runLinked(link, () =>
          adapter.linkAccount(googleAccount(user.id, 'g-ok')),
        );
        expect(await credentialsFor(user.id)).toEqual({
          accounts: 1,
          authenticators: 0,
        });
      });

      it('paused before the write, session revoked, then resumed: nothing is linked', async () => {
        const { user, session, link } = await linkingSession();
        const attempt = runLinked(link, async () => {
          // Auth.js has passed the route guard and finished talking to Google;
          // before it saves the link, the owner signs that session out.
          await prisma.userSession.update({
            where: { id: session.id },
            data: { revokedAt: new Date() },
          });
          return adapter.linkAccount(googleAccount(user.id, 'g-revoked'));
        });
        await expect(attempt).rejects.toBeInstanceOf(CredentialRefused);
        expect(await credentialsFor(user.id)).toEqual({
          accounts: 0,
          authenticators: 0,
        });
      });

      it('a reset holding the user lock wins: the waiting link sees it and saves nothing', async () => {
        const { user, link } = await linkingSession();
        let locked!: () => void;
        let finish!: () => void;
        const lockedP = new Promise<void>((resolve) => (locked = resolve));
        const finishP = new Promise<void>((resolve) => (finish = resolve));
        const reset = prisma.$transaction(async (tx) => {
          await lockUserSecurity(tx, user.id);
          locked();
          await finishP;
          await tx.user.update({
            where: { id: user.id },
            data: { sessionVersion: { increment: 1 } },
          });
          await revokeSessions(tx, user.id);
        });
        await lockedP;
        const attempt = runLinked(link, () =>
          adapter.linkAccount(googleAccount(user.id, 'g-race')),
        );
        // The link is now queued behind the reset's lock.
        await new Promise((resolve) => setTimeout(resolve, 100));
        finish();
        await reset;
        await expect(attempt).rejects.toBeInstanceOf(CredentialRefused);
        expect(await credentialsFor(user.id)).toEqual({
          accounts: 0,
          authenticators: 0,
        });
      });

      it('a session that is no longer recently authenticated cannot link', async () => {
        const { user, link } = await linkingSession({
          authenticatedAt: HOUR_AGO(),
        });
        await expect(
          runLinked(link, () =>
            adapter.linkAccount(googleAccount(user.id, 'g-stale')),
          ),
        ).rejects.toBeInstanceOf(CredentialRefused);
        expect(await credentialsFor(user.id)).toEqual({
          accounts: 0,
          authenticators: 0,
        });
      });

      it('the credential must belong to the linking user', async () => {
        const { link } = await linkingSession();
        const other = await createUser();
        await expect(
          runLinked(link, () =>
            adapter.linkAccount(googleAccount(other.id, 'g-other')),
          ),
        ).rejects.toBeInstanceOf(CredentialRefused);
        expect(await credentialsFor(other.id)).toEqual({
          accounts: 0,
          authenticators: 0,
        });
      });

      it('without a linking context, an existing user is never linked', async () => {
        const user = await createUser();
        await expect(
          runAuthRequest(null, () =>
            adapter.linkAccount(googleAccount(user.id, 'g-none')),
          ),
        ).rejects.toBeInstanceOf(CredentialRefused);
        await expect(
          adapter.linkAccount(googleAccount(user.id, 'g-bare')),
        ).rejects.toBeInstanceOf(CredentialRefused);
        expect(await credentialsFor(user.id)).toEqual({
          accounts: 0,
          authenticators: 0,
        });
      });

      it('control: a brand-new Google sign-up links to the user created in the same request', async () => {
        const created = await runAuthRequest(null, async () => {
          const user = await adapter.createUser({
            email: 'New.Person@Example.test',
            name: 'New Person',
            emailVerified: null,
          });
          await adapter.linkAccount(googleAccount(user.id, 'g-new'));
          return user;
        });
        expect(await credentialsFor(created.id)).toEqual({
          accounts: 1,
          authenticators: 0,
        });
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: created.id } }))
            .email,
        ).toBe('new.person@example.test');
      });
    });

    describe('passkey registration (adapter.linkAccount then createAuthenticator)', () => {
      const register = (
        userId: string,
        credentialID: string,
        between?: () => Promise<unknown>,
      ) =>
        (async () => {
          await adapter.linkAccount(passkeyAccount(userId, credentialID));
          if (between) await between();
          return adapter.createAuthenticator(
            authenticator(userId, credentialID),
          );
        })();

      it('control: a valid linking session saves the passkey', async () => {
        const { user, link } = await linkingSession();
        await runLinked(link, () => register(user.id, 'cred-ok'));
        expect(await credentialsFor(user.id)).toEqual({
          accounts: 1,
          authenticators: 1,
        });
      });

      it('session revoked before the first write: nothing is saved', async () => {
        const { user, session, link } = await linkingSession();
        await prisma.userSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        await expect(
          runLinked(link, () => register(user.id, 'cred-early')),
        ).rejects.toBeInstanceOf(CredentialRefused);
        expect(await credentialsFor(user.id)).toEqual({
          accounts: 0,
          authenticators: 0,
        });
      });

      it('reset between the two writes: the passkey and its account row are both gone', async () => {
        const { user, link } = await linkingSession();
        const attempt = runLinked(link, () =>
          register(user.id, 'cred-mid', async () => {
            // Auth.js has saved the passkey account; a reset lands before the
            // authenticator is saved.
            await prisma.$transaction(async (tx) => {
              await lockUserSecurity(tx, user.id);
              await tx.user.update({
                where: { id: user.id },
                data: { sessionVersion: { increment: 1 } },
              });
              await revokeSessions(tx, user.id);
            });
          }),
        );
        await expect(attempt).rejects.toBeInstanceOf(CredentialRefused);
        expect(await credentialsFor(user.id)).toEqual({
          accounts: 0,
          authenticators: 0,
        });
      });

      it('without a linking context a passkey is never saved', async () => {
        const user = await createUser();
        await expect(
          runAuthRequest(null, () =>
            adapter.createAuthenticator(authenticator(user.id, 'cred-none')),
          ),
        ).rejects.toBeInstanceOf(CredentialRefused);
        expect(await credentialsFor(user.id)).toEqual({
          accounts: 0,
          authenticators: 0,
        });
      });
    });
  },
);
