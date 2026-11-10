// @vitest-environment node
import { dbTestsEnabled } from '../../../../test/db-env';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '../../../../test/db-reset';
import { POST as signup } from '../../app/api/account/signup/route';
import { POST as verifySignup } from '../../app/api/account/signup/verify/route';
import { POST as requestReset } from '../../app/api/account/password-reset/route';
import { POST as confirmReset } from '../../app/api/account/password-reset/confirm/route';
import { issueChallenge } from './challenges';
import { hashPassword, verifyPassword } from './password';
import { authorizePassword, PasswordRateLimited } from './password-signin';

delete process.env.RESEND_API_KEY;
const ORIGIN = 'http://localhost:3000';

const post = (
  handler: (r: Request) => Promise<Response>,
  body: unknown,
  origin = ORIGIN,
) =>
  handler(
    new Request(`${ORIGIN}/api/account`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

/** Development email goes to console.info; read the last six-digit code from it. */
const mail = vi.spyOn(console, 'info').mockImplementation(() => {});
const lastCode = () => {
  const text = String(mail.mock.calls.at(-1)?.[0] ?? '');
  return /\b(\d{6})\b/.exec(text)?.[1] ?? '';
};

describe.skipIf(!dbTestsEnabled)('account flows (PostgreSQL)', () => {
  beforeEach(async () => {
    await resetIdentityTables();
    mail.mockClear();
  });
  afterAll(() => prisma.$disconnect());

  it('refuses cross-site requests', async () => {
    const response = await post(
      signup,
      { name: 'X', email: 'x@example.test', password: 'password123' },
      'https://evil.example',
    );
    expect(response.status).toBe(403);
  });

  it('only the latest verified sign-up request becomes the account (no pre-hijacking)', async () => {
    const email = 'victim@example.test';
    await post(signup, {
      name: 'Attacker',
      email,
      password: 'attacker-pass-1',
    });
    const attackerCode = lastCode();
    await post(signup, { name: 'Victim', email, password: 'victim-pass-12' });
    const victimCode = lastCode();
    expect(attackerCode).toMatch(/^\d{6}$/);
    expect(
      (await post(verifySignup, { email, code: attackerCode })).status,
    ).toBe(400);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect((await post(verifySignup, { email, code: victimCode })).status).toBe(
      201,
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.role).toBe('MEMBER');
    expect(user.emailVerified).not.toBeNull();
    expect(await verifyPassword(user.passwordHash, 'victim-pass-12')).toBe(
      true,
    );
    expect(await verifyPassword(user.passwordHash, 'attacker-pass-1')).toBe(
      false,
    );
  });

  it('answers sign-up identically for an existing email and creates no code', async () => {
    const existing = await createUser();
    const fresh = await post(signup, {
      name: 'New',
      email: 'new@example.test',
      password: 'password123',
    });
    const taken = await post(signup, {
      name: 'Dup',
      email: existing.email,
      password: 'password123',
    });
    expect(taken.status).toBe(fresh.status);
    expect(await taken.json()).toEqual(await fresh.json());
    expect(
      await prisma.authChallenge.count({ where: { email: existing.email } }),
    ).toBe(0);
  });

  it('stores only keyed hashes and voids a code after five wrong guesses', async () => {
    const email = 'guess@example.test';
    await post(signup, { name: 'G', email, password: 'password123' });
    const code = lastCode();
    const stored = await prisma.authChallenge.findFirstOrThrow({
      where: { email },
    });
    expect(stored.codeHash).not.toContain(code);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1)
      await post(verifySignup, { email, code: wrong });
    expect((await post(verifySignup, { email, code })).status).not.toBe(201);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('a code for one purpose cannot be used for another', async () => {
    const user = await createUser();
    const code = await prisma.$transaction((tx) =>
      issueChallenge(tx, {
        purpose: 'REAUTH',
        email: user.email,
        userId: user.id,
      }),
    );
    const response = await post(confirmReset, {
      email: user.email,
      code,
      password: 'new-password-1',
    });
    expect(response.status).toBe(400);
  });

  it('two simultaneous verifications of one code create one account', async () => {
    const email = 'race@example.test';
    await post(signup, { name: 'R', email, password: 'password123' });
    const code = lastCode();
    const results = await Promise.all([
      post(verifySignup, { email, code }),
      post(verifySignup, { email, code }),
    ]);
    expect(results.map((r) => r.status).filter((s) => s === 201)).toHaveLength(
      1,
    );
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('password reset is single use, sets the password and ends every session', async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    expect((await post(requestReset, { email: user.email })).status).toBe(202);
    const code = lastCode();
    expect(
      (
        await post(confirmReset, {
          email: user.email,
          code,
          password: 'brand-new-pass',
        })
      ).status,
    ).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.sessionVersion).toBe(2);
    expect(await verifyPassword(after.passwordHash, 'brand-new-pass')).toBe(
      true,
    );
    expect(
      (
        await prisma.userSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).revokedAt,
    ).not.toBeNull();
    expect(
      (
        await post(confirmReset, {
          email: user.email,
          code,
          password: 'another-pass-1',
        })
      ).status,
    ).toBe(400);
  });

  it('reset requests for unknown or suspended accounts look the same and send nothing', async () => {
    const suspended = await createUser({ status: 'SUSPENDED' });
    const unknown = await post(requestReset, { email: 'nobody@example.test' });
    const blocked = await post(requestReset, { email: suspended.email });
    expect(unknown.status).toBe(202);
    expect(await blocked.json()).toEqual(await unknown.json());
    expect(mail).not.toHaveBeenCalled();
  });

  it('password sign-in: generic failures, then throttled before checking the password', async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword('correct-horse-1') },
    });
    const request = new Request(`${ORIGIN}/api/auth/callback/password`);
    const attempt = (password: string, email = user.email) =>
      authorizePassword({ email, password }, request);
    expect(await attempt('correct-horse-1')).toMatchObject({ id: user.id });
    expect(await attempt('nope', 'missing@example.test')).toBeNull();
    for (let i = 0; i < 5; i += 1)
      expect(await attempt('wrong-password')).toBeNull();
    await expect(attempt('correct-horse-1')).rejects.toBeInstanceOf(
      PasswordRateLimited,
    );
  });

  it('suspended accounts cannot sign in with a correct password', async () => {
    const user = await createUser({ status: 'SUSPENDED' });
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword('correct-horse-1') },
    });
    const request = new Request(`${ORIGIN}/api/auth/callback/password`);
    expect(
      await authorizePassword(
        { email: user.email, password: 'correct-horse-1' },
        request,
      ),
    ).toBeNull();
  });
});
