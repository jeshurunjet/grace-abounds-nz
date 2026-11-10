// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';

/** The signed-in session the mocked auth() reports. */
const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string }; sessionId: string },
}));
vi.mock('../../auth', () => ({ auth: async () => state.session }));
/** Real hashing, with the ability to hold one call open. */
vi.mock('./password', async (importOriginal) => {
  const real = await importOriginal<typeof import('./password')>();
  return {
    ...real,
    hashPassword: vi.fn(real.hashPassword),
    verifyPassword: vi.fn(real.verifyPassword),
  };
});

const password = await import('./password');
const real = await vi.importActual<typeof import('./password')>('./password');
const { POST: changePassword } =
  await import('../../app/api/account/password/route');
const { POST: confirmReset } =
  await import('../../app/api/account/password-reset/confirm/route');
const { POST: reauth } = await import('../../app/api/account/reauth/route');
const { issueChallenge } = await import('./challenges');

const ORIGIN = 'http://localhost:3000';
const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(
    new Request(`${ORIGIN}/api/account`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

/** Makes the next hashPassword call wait until release() is called. */
function holdNextHash() {
  let started!: () => void;
  let release!: () => void;
  const startedP = new Promise<void>((resolve) => (started = resolve));
  const gate = new Promise<void>((resolve) => (release = resolve));
  vi.mocked(password.hashPassword).mockImplementationOnce(
    async (value: string) => {
      started();
      await gate;
      return real.hashPassword(value);
    },
  );
  return { started: startedP, release };
}

describe.skipIf(!dbTestsEnabled)(
  'credential changes under concurrency (PostgreSQL)',
  () => {
    beforeEach(async () => {
      await resetIdentityTables();
      state.session = null;
    });
    afterAll(() => prisma.$disconnect());

    async function signedInWithPassword(value: string) {
      const user = await createUser();
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await real.hashPassword(value) },
      });
      const session = await createSession(user.id);
      state.session = { user: { id: user.id }, sessionId: session.id };
      return { user, session };
    }

    it('a password change paused during hashing cannot overwrite a reset that happened meanwhile', async () => {
      const { user, session } = await signedInWithPassword('original-pass-1');
      const hold = holdNextHash();
      const pending = post(changePassword, { password: 'stale-change-1' });
      await hold.started;

      // Meanwhile, on another device: a password reset (revokes this session).
      const code = await prisma.$transaction((tx) =>
        issueChallenge(tx, {
          purpose: 'PASSWORD_RESET',
          email: user.email,
          userId: user.id,
        }),
      );
      expect(
        (
          await post(confirmReset, {
            email: user.email,
            code,
            password: 'recovered-pass-1',
          })
        ).status,
      ).toBe(200);
      // ...and the owner signs in again with the recovered password.
      const fresh = await createSession(user.id);

      hold.release();
      const response = await pending;
      expect(response.status).toBe(401);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(
        await real.verifyPassword(after.passwordHash, 'recovered-pass-1'),
      ).toBe(true);
      expect(
        await real.verifyPassword(after.passwordHash, 'stale-change-1'),
      ).toBe(false);
      expect(
        (
          await prisma.userSession.findUniqueOrThrow({
            where: { id: fresh.id },
          })
        ).revokedAt,
      ).toBeNull();
      expect(
        (
          await prisma.userSession.findUniqueOrThrow({
            where: { id: session.id },
          })
        ).revokedAt,
      ).not.toBeNull();
    });

    it('a password change paused while its session is signed out elsewhere does not commit', async () => {
      const { user, session } = await signedInWithPassword('original-pass-1');
      const hold = holdNextHash();
      const pending = post(changePassword, { password: 'stale-change-1' });
      await hold.started;
      await prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      hold.release();
      expect((await pending).status).toBe(401);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(
        await real.verifyPassword(after.passwordHash, 'original-pass-1'),
      ).toBe(true);
    });

    it('without interference, the change commits and signs out other sessions only', async () => {
      const { user, session } = await signedInWithPassword('original-pass-1');
      const other = await createSession(user.id);
      const response = await post(changePassword, {
        password: 'brand-new-pass-1',
      });
      expect(response.status).toBe(200);
      expect(
        (
          await prisma.userSession.findUniqueOrThrow({
            where: { id: other.id },
          })
        ).revokedAt,
      ).not.toBeNull();
      expect(
        (
          await prisma.userSession.findUniqueOrThrow({
            where: { id: session.id },
          })
        ).revokedAt,
      ).toBeNull();
    });

    it('re-authentication whose password is replaced during verification is refused', async () => {
      const { user, session } = await signedInWithPassword('original-pass-1');
      const stale = new Date(Date.now() - 60 * 60 * 1000);
      await prisma.userSession.update({
        where: { id: session.id },
        data: { authenticatedAt: stale },
      });
      let started!: () => void;
      let release!: () => void;
      const startedP = new Promise<void>((resolve) => (started = resolve));
      const gate = new Promise<void>((resolve) => (release = resolve));
      vi.mocked(password.verifyPassword).mockImplementationOnce(
        async (stored, value) => {
          const result = await real.verifyPassword(stored, value);
          started();
          await gate;
          return result;
        },
      );
      const pending = post(reauth, {
        method: 'password',
        password: 'original-pass-1',
      });
      await startedP;
      // The old password checked out, but it is replaced before the proof commits.
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await real.hashPassword('replaced-pass-1') },
      });
      release();
      expect((await pending).status).toBe(400);
      const row = await prisma.userSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(row.authenticatedAt.getTime()).toBe(stale.getTime());
    });
  },
);
