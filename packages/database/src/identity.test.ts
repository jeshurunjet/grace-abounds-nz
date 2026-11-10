// @vitest-environment node
import { dbTestsEnabled } from './test-env.ts';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertPastorRemains,
  consumeAttempt,
  LastPastorError,
  loadActiveSession,
  lockPastorSet,
  prisma,
} from './index.ts';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from './testing.ts';

describe.skipIf(!dbTestsEnabled)('identity helpers (PostgreSQL)', () => {
  beforeEach(resetIdentityTables);
  afterAll(() => prisma.$disconnect());

  it('lets exactly max of many concurrent attempts through', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeAttempt(prisma, 'race:key', 5, 60_000),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it('starts a new window after the old one ends', async () => {
    await prisma.authAttempt.create({
      data: {
        key: 'old',
        count: 99,
        windowStart: new Date(Date.now() - 120_000),
      },
    });
    expect(await consumeAttempt(prisma, 'old', 5, 60_000)).toBe(true);
  });

  it('accepts only valid, current sessions', async () => {
    const user = await createUser();
    const other = await createUser();
    const session = await createSession(user.id);
    const claims = {
      userId: user.id,
      sessionId: session.id,
      sessionVersion: 1,
    };
    expect(await loadActiveSession(prisma, claims)).not.toBeNull();
    // sid belonging to someone else
    expect(
      await loadActiveSession(prisma, { ...claims, userId: other.id }),
    ).toBeNull();
    // stale sessionVersion in the token
    expect(
      await loadActiveSession(prisma, { ...claims, sessionVersion: 2 }),
    ).toBeNull();
    // revoked
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    expect(await loadActiveSession(prisma, claims)).toBeNull();
    // expired
    const expired = await createSession(user.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(
      await loadActiveSession(prisma, { ...claims, sessionId: expired.id }),
    ).toBeNull();
  });

  it('ends every session when sessionVersion increments or the account is suspended', async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    const claims = {
      userId: user.id,
      sessionId: session.id,
      sessionVersion: 1,
    };
    await prisma.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    expect(await loadActiveSession(prisma, claims)).toBeNull();
    const second = await createSession(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'SUSPENDED' },
    });
    expect(
      await loadActiveSession(prisma, {
        ...claims,
        sessionId: second.id,
        sessionVersion: 2,
      }),
    ).toBeNull();
  });

  it('never lets concurrent changes remove the last active Pastor', async () => {
    const [a, b] = [
      await createUser({ role: 'PASTOR' }),
      await createUser({ role: 'PASTOR' }),
    ];
    const demote = (id: string) =>
      prisma.$transaction(async (tx) => {
        await lockPastorSet(tx);
        await assertPastorRemains(tx, id, { role: 'MEMBER' });
        await tx.user.update({ where: { id }, data: { role: 'MEMBER' } });
      });
    const results = await Promise.allSettled([demote(a!.id), demote(b!.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(LastPastorError);
    expect(
      await prisma.user.count({ where: { role: 'PASTOR', status: 'ACTIVE' } }),
    ).toBe(1);
  });
});
