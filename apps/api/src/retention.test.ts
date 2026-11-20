// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { SignJWT } from 'jose';
import { prisma, recordAudit } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';
import { addDays, nzNow } from '@grace-abounds/validation';
import { buildApp } from './app.js';
import {
  allowDeletionExecutionForTests,
  purgeDeletedAccounts,
  trimAuditLog,
} from './lib/account-deletion.js';
import { expirePrayers } from './lib/care-retention.js';
import {
  lockRetentionGate,
  setRetentionPauseForTests,
} from './lib/retention-holds.js';

/*
 * Phase 5C revised policy: staff see what is due (counts only) and, once
 * enabled, remove only due records with "Delete eligible records now":
 * deleted accounts past 30 days and calendar-year-expired activity records.
 * Narrow, documented records holds (legal obligation, investigation,
 * claim) with a review date at most a year ahead keep a person's records
 * out of every clean-up until released. Recent sign-in, fixed staff roles,
 * one run at a time, and no care contents anywhere.
 *
 * Corrections: null-safe hold predicates; every clean-up serialized with
 * hold changes through the retention gate (forced interleavings below);
 * holds cover staff entries about a held person's care records through
 * the canonical audit subject; each run is a durable, fenced, resumable
 * job with exact counts.
 */

const DAY = 86_400_000;
const today = () => nzNow().date;
const RUN = '/v1/staff/retention/run';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const GATE = 7_204_202;
/** Waits until `count` transactions wait on the retention gate. */
async function waitForGateWaiters(count = 1) {
  for (let tries = 0; tries < 250; tries++) {
    const [row] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND objid = ${GATE} AND objsubid = 1
        AND NOT granted`;
    if (row!.n >= count) return;
    await tick();
  }
  throw new Error('Nothing waited on the retention gate.');
}
/** Waits until someone holds the retention gate. */
async function waitForGateHeld() {
  for (let tries = 0; tries < 250; tries++) {
    const [row] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND objid = ${GATE} AND objsubid = 1
        AND granted`;
    if (row!.n > 0) return;
    await tick();
  }
  throw new Error('Nobody took the retention gate.');
}

describe.skipIf(!dbTestsEnabled)('records retention (PostgreSQL)', () => {
  const app = buildApp();
  beforeAll(() => app.ready());
  beforeEach(async () => {
    await resetIdentityTables();
    allowDeletionExecutionForTests(false);
    setRetentionPauseForTests(null);
  });
  afterEach(() => {
    allowDeletionExecutionForTests(false);
    setRetentionPauseForTests(null);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function as(
    role: 'MEMBER' | 'ADMIN' | 'PASTOR' = 'MEMBER',
    authenticatedAt?: Date,
  ) {
    const user = await createUser({ role });
    const session = await createSession(user.id, { authenticatedAt });
    const token = await new SignJWT({ sid: session.id, sv: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('grace-web')
      .setAudience('grace-api')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(new TextEncoder().encode(process.env.API_ASSERTION_SECRET!));
    return { user, headers: { authorization: `Bearer ${token}` } };
  }
  type Who = Awaited<ReturnType<typeof as>>;
  const call = (
    method: string,
    url: string,
    who?: Who,
    body?: unknown,
    version?: number,
  ) =>
    app.inject({
      method: method as never,
      url,
      headers: {
        ...who?.headers,
        ...(version !== undefined && { 'if-match': `"${version}"` }),
      },
      ...(body !== undefined && { payload: body as never }),
    });
  const placeHold = (who: Who, userId: string, over: object = {}) =>
    call('POST', '/v1/staff/holds', who, {
      userId,
      reason: 'claim',
      reference: 'Claim 2026-14',
      basis: 'Records needed while a claim is resolved.',
      reviewBy: addDays(today(), 90),
      ...over,
    });
  let keys = 0;
  const run = (who: Who, requestKey = `press-${++keys}-key`) =>
    call('POST', RUN, who, { requestKey });
  /** A deleted member whose 30 days are over (records still kept). */
  async function deletedLongAgo() {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'DELETION_PENDING',
        email: `deleted+${user.id}@deleted.invalid`,
      },
    });
    await prisma.prayerRequest.create({
      data: { userId: user.id, text: 'Private words', clientKey: 'k' },
    });
    await prisma.accountDeletion.create({
      data: {
        userId: user.id,
        via: 'self',
        requestedById: user.id,
        requestedAt: new Date(Date.now() - 40 * DAY),
        purgeAfter: new Date(Date.now() - 10 * DAY),
      },
    });
    return user;
  }
  const ancient = new Date(Date.now() - 3 * 365 * DAY);

  it('members get nothing; staff see counts only; running is switched off', async () => {
    const [member, admin, pastor] = [
      await as(),
      await as('ADMIN'),
      await as('PASTOR'),
    ];
    for (const url of ['/v1/staff/retention', '/v1/staff/holds'])
      expect((await call('GET', url, member)).statusCode).toBe(403);
    expect((await run(member)).statusCode).toBe(403);
    expect((await placeHold(member, admin.user.id)).statusCode).toBe(403);

    await deletedLongAgo();
    await prisma.auditEvent.create({
      data: {
        action: 'old.event',
        entityType: 'x',
        entityId: '1',
        createdAt: ancient,
      },
    });
    for (const who of [admin, pastor]) {
      const preview = await call('GET', '/v1/staff/retention', who);
      expect(preview.statusCode).toBe(200);
      expect(preview.json().data).toMatchObject({
        enabled: false,
        due: { deletedAccounts: 1, auditEvents: 1 },
        held: { deletedAccounts: 0, auditEvents: 0 },
      });
      expect(preview.body).not.toContain('Private words');
    }
    const off = await run(admin);
    expect(off.statusCode).toBe(503);
    expect(off.json().error.code).toBe('DELETION_UNAVAILABLE');
    expect(
      await prisma.user.count({ where: { status: 'DELETION_PENDING' } }),
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { action: 'old.event' } }),
    ).toBe(1);
  });

  it('removes only what is due, keeps held people’s records, and says so', async () => {
    allowDeletionExecutionForTests(true);
    const admin = await as('ADMIN');
    const due = await deletedLongAgo();
    const held = await deletedLongAgo();
    // A deleted account still inside its 30 days stays.
    const recent = await createUser();
    await prisma.user.update({
      where: { id: recent.id },
      data: { status: 'DELETION_PENDING' },
    });
    await prisma.accountDeletion.create({
      data: {
        userId: recent.id,
        via: 'self',
        requestedById: recent.id,
        purgeAfter: new Date(Date.now() + 20 * DAY),
      },
    });
    expect((await placeHold(admin, held.id)).statusCode).toBe(201);
    await prisma.auditEvent.createMany({
      data: [
        {
          action: 'old.free',
          entityType: 'User',
          entityId: 'someone',
          createdAt: ancient,
        },
        {
          action: 'old.held',
          entityType: 'User',
          entityId: held.id,
          createdAt: ancient,
        },
        {
          action: 'old.by.held',
          actorId: held.id,
          entityType: 'x',
          entityId: 'y',
          createdAt: ancient,
        },
        { action: 'this.year', entityType: 'x', entityId: 'z' },
      ],
    });
    const preview = (await call('GET', '/v1/staff/retention', admin)).json()
      .data;
    expect(preview).toMatchObject({
      enabled: true,
      due: { deletedAccounts: 1, auditEvents: 1 },
      held: { deletedAccounts: 1, auditEvents: 2 },
      holds: { active: 1, overdue: 0 },
    });

    const first = await run(admin);
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toMatchObject({
      status: 'done',
      removed: { deletedAccounts: 1, auditEvents: 1 },
      held: { deletedAccounts: 1, auditEvents: 2 },
      more: false,
    });
    expect(await prisma.user.count({ where: { id: due.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: held.id } })).toBe(1);
    expect(await prisma.user.count({ where: { id: recent.id } })).toBe(1);
    expect(
      await prisma.prayerRequest.count({ where: { userId: held.id } }),
    ).toBe(1);
    const left = (await prisma.auditEvent.findMany()).map((row) => row.action);
    expect(left).toEqual(
      expect.arrayContaining(['old.held', 'old.by.held', 'this.year']),
    );
    expect(left).not.toContain('old.free');
    const finished = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'retention.run_finished' },
    });
    expect(JSON.stringify(finished)).not.toContain('Private words');
    // Nothing more is due; the held account is still reported as held.
    expect(
      (await call('GET', '/v1/staff/retention', admin)).json().data,
    ).toMatchObject({
      due: { deletedAccounts: 0, auditEvents: 0 },
      held: { deletedAccounts: 1 },
      lastRun: { status: 'done' },
    });

    // Releasing the hold lets the next run remove it.
    const [hold] = (await call('GET', '/v1/staff/holds', admin)).json().data;
    expect(
      (
        await call(
          'POST',
          `/v1/staff/holds/${hold.id}/release`,
          admin,
          {},
          hold.version,
        )
      ).statusCode,
    ).toBe(204);
    expect((await run(admin)).json().data.removed).toMatchObject({
      deletedAccounts: 1,
      auditEvents: 2,
    });
  });

  it('a run needs a recent sign-in and only one runs at a time; a crashed run doesn’t block', async () => {
    allowDeletionExecutionForTests(true);
    const stale = await as('PASTOR', new Date(Date.now() - 60 * 60_000));
    expect((await run(stale)).json().error.code).toBe('REAUTH_REQUIRED');
    const admin = await as('ADMIN');
    expect((await call('POST', RUN, admin, {})).statusCode).toBe(422);
    const live = await prisma.retentionRun.create({
      data: {
        requestedById: admin.user.id,
        claimToken: 'someone-else',
        leaseUntil: new Date(Date.now() + 60_000),
      },
    });
    const busy = await run(admin);
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.code).toBe('RETENTION_RUNNING');
    await prisma.retentionRun.update({
      where: { id: live.id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    expect((await run(admin)).statusCode).toBe(200);
    // The crashed run lost its claim (fenced off), with its counts kept.
    expect(
      await prisma.retentionRun.findUniqueOrThrow({ where: { id: live.id } }),
    ).toMatchObject({
      status: 'FAILED',
      failure: 'abandoned',
      claimToken: null,
    });
    // Two presses at once: never two runs at the same time (the second is
    // told one is running, or starts after the first has finished).
    const [a, b] = await Promise.all([run(admin), run(admin)]);
    expect([a.statusCode, b.statusCode]).toContain(200);
    for (const response of [a, b])
      expect([200, 409]).toContain(response.statusCode);
  });

  it('works in batches and says when more remain', async () => {
    allowDeletionExecutionForTests(true);
    await deletedLongAgo();
    await deletedLongAgo();
    expect(await purgeDeletedAccounts(new Date(), 1)).toMatchObject({
      purged: 1,
      more: true,
    });
    expect(await purgeDeletedAccounts(new Date(), 1)).toMatchObject({
      purged: 1,
      more: false,
    });
  });

  describe('records holds', () => {
    it('are narrow and documented: reason, reference, basis, review within a year', async () => {
      const [admin, member] = [await as('ADMIN'), await as()];
      for (const over of [
        { reviewBy: today() },
        { reviewBy: addDays(today(), 366) },
        { reason: 'because' },
        { reference: '' },
        { basis: 'x' },
      ])
        expect((await placeHold(admin, member.user.id, over)).statusCode).toBe(
          422,
        );
      expect((await placeHold(admin, 'guessed-id')).statusCode).toBe(404);
      const stale = await as('ADMIN', new Date(Date.now() - 60 * 60_000));
      expect((await placeHold(stale, member.user.id)).json().error.code).toBe(
        'REAUTH_REQUIRED',
      );
      const placed = await placeHold(admin, member.user.id);
      expect(placed.statusCode).toBe(201);
      expect(placed.json().data).toMatchObject({
        userId: member.user.id,
        reason: 'claim',
        reviewBy: addDays(today(), 90),
        overdue: false,
        version: 1,
      });
      // The audit entry never holds the reference or basis.
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'retention.hold_placed' },
      });
      expect(JSON.stringify(audit)).not.toContain('Claim 2026-14');
      // People detail shows it.
      expect(
        (await call('GET', `/v1/staff/members/${member.user.id}`, admin)).json()
          .data.holds,
      ).toHaveLength(1);
    });

    it('renewing needs the version shown and a review date within a year', async () => {
      const [admin, member] = [await as('ADMIN'), await as()];
      const hold = (await placeHold(admin, member.user.id)).json().data;
      const renew = (version: number, reviewBy: string) =>
        call(
          'POST',
          `/v1/staff/holds/${hold.id}/renew`,
          admin,
          { reviewBy },
          version,
        );
      expect((await renew(9, addDays(today(), 200))).statusCode).toBe(412);
      expect((await renew(1, addDays(today(), 400))).statusCode).toBe(422);
      const renewed = await renew(1, addDays(today(), 200));
      expect(renewed.json().data).toMatchObject({
        reviewBy: addDays(today(), 200),
        version: 2,
      });
      // Released holds can't be changed.
      await call('POST', `/v1/staff/holds/${hold.id}/release`, admin, {}, 2);
      expect((await renew(3, addDays(today(), 100))).statusCode).toBe(404);
    });

    it('an overdue review is shown, and the hold keeps protecting until released', async () => {
      allowDeletionExecutionForTests(true);
      const admin = await as('ADMIN');
      const held = await deletedLongAgo();
      const hold = (await placeHold(admin, held.id)).json().data;
      await prisma.retentionHold.update({
        where: { id: hold.id },
        data: { reviewBy: new Date(Date.now() - 2 * DAY) },
      });
      expect(
        (await call('GET', '/v1/staff/holds', admin)).json().data[0].overdue,
      ).toBe(true);
      expect(
        (await call('GET', '/v1/staff/retention', admin)).json().data.holds,
      ).toEqual({ active: 1, overdue: 1 });
      expect((await purgeDeletedAccounts()).purged).toBe(0);
      expect(await prisma.user.count({ where: { id: held.id } })).toBe(1);
    });

    it('also keep a person’s records out of ordinary care retention', async () => {
      const admin = await as('ADMIN');
      const [kept, gone] = [await as(), await as()];
      for (const who of [kept, gone])
        await prisma.prayerRequest.create({
          data: {
            userId: who.user.id,
            text: 'Words',
            clientKey: 'k',
            status: 'PRAYED_FOR',
            closedAt: new Date(Date.now() - 400 * DAY),
          },
        });
      await placeHold(admin, kept.user.id);
      expect(await expirePrayers()).toBe(1);
      expect(
        await prisma.prayerRequest.count({ where: { userId: kept.user.id } }),
      ).toBe(1);
    });
  });

  describe('who a hold covers (null-safe, canonical subject)', () => {
    it('entries without an actor or subject are eligible; held people’s entries are kept, whichever field names them', async () => {
      allowDeletionExecutionForTests(true);
      const admin = await as('ADMIN');
      const [held, free] = [await as(), await as()];
      await placeHold(admin, held.user.id);
      const old = { createdAt: ancient };
      await prisma.auditEvent.createMany({
        data: [
          // Removed: nobody held is named, including null actor/subject.
          { ...old, action: 'gone.null.null', entityType: 'x', entityId: '1' },
          {
            ...old,
            action: 'gone.free.null',
            actorId: free.user.id,
            entityType: 'x',
            entityId: '2',
          },
          {
            ...old,
            action: 'gone.null.free',
            entityType: 'prayer',
            entityId: 'p-free',
            subjectId: free.user.id,
          },
          {
            ...old,
            action: 'gone.free.free',
            actorId: free.user.id,
            entityType: 'User',
            entityId: free.user.id,
            subjectId: free.user.id,
          },
          // Kept: a held person is the actor, the subject or the entity.
          {
            ...old,
            action: 'kept.held.null',
            actorId: held.user.id,
            entityType: 'x',
            entityId: '3',
          },
          {
            ...old,
            action: 'kept.null.held',
            entityType: 'appointment',
            entityId: 'a-held',
            subjectId: held.user.id,
          },
          {
            ...old,
            action: 'kept.free.held',
            actorId: free.user.id,
            entityType: 'prayer',
            entityId: 'p-held',
            subjectId: held.user.id,
          },
          {
            ...old,
            action: 'kept.entity.held',
            entityType: 'User',
            entityId: held.user.id,
          },
        ],
      });
      const preview = (await call('GET', '/v1/staff/retention', admin)).json()
        .data;
      // Exact, and the two counts partition every eligible entry.
      expect(preview.due.auditEvents).toBe(4);
      expect(preview.held.auditEvents).toBe(4);
      expect(await trimAuditLog()).toMatchObject({ events: 4, held: 4 });
      const left = (await prisma.auditEvent.findMany({ where: old })).map(
        (row) => row.action,
      );
      expect(left.sort()).toEqual([
        'kept.entity.held',
        'kept.free.held',
        'kept.held.null',
        'kept.null.held',
      ]);
    });

    it('staff entries about a held person’s care records are kept, also after the record itself is gone', async () => {
      allowDeletionExecutionForTests(true);
      const [admin, pastor, member] = [
        await as('ADMIN'),
        await as('PASTOR'),
        await as(),
      ];
      const prayer = await prisma.prayerRequest.create({
        data: { userId: member.user.id, text: 'Private words', clientKey: 'c' },
      });
      // Recorded the usual way: the subject is the prayer's owner.
      const entry = await recordAudit(prisma, {
        actorId: pastor.user.id,
        action: 'care.prayer_note_added',
        entityType: 'prayer',
        entityId: prayer.id,
      });
      expect(entry.subjectId).toBe(member.user.id);
      expect(JSON.stringify(entry)).not.toContain('Private words');
      // Church content is about nobody in particular.
      const page = await recordAudit(prisma, {
        actorId: pastor.user.id,
        action: 'page.updated',
        entityType: 'page',
        entityId: 'about',
      });
      expect(page.subjectId).toBeNull();
      await prisma.auditEvent.updateMany({
        where: { id: { in: [entry.id, page.id] } },
        data: { createdAt: ancient },
      });
      const hold = (await placeHold(admin, member.user.id)).json().data;
      await prisma.prayerRequest.delete({ where: { id: prayer.id } });
      expect(await trimAuditLog()).toMatchObject({ events: 1, held: 1 });
      expect(await prisma.auditEvent.count({ where: { id: entry.id } })).toBe(
        1,
      );
      await call(
        'POST',
        `/v1/staff/holds/${hold.id}/release`,
        admin,
        {},
        hold.version,
      );
      expect((await trimAuditLog()).events).toBe(1);
      expect(await prisma.auditEvent.count({ where: { id: entry.id } })).toBe(
        0,
      );
    });
  });

  describe('serialized with hold changes (forced interleavings)', () => {
    it('a hold placed while care retention is mid-way waits for it, never landing between its check and its delete', async () => {
      const admin = await as('ADMIN');
      const member = await as();
      await prisma.prayerRequest.create({
        data: {
          userId: member.user.id,
          text: 'Words',
          clientKey: 'k',
          status: 'PRAYED_FOR',
          closedAt: new Date(Date.now() - 400 * DAY),
        },
      });
      let placing: ReturnType<typeof placeHold> | null = null;
      setRetentionPauseForTests(async (point) => {
        if (point !== 'care.scanned' || placing) return;
        placing = placeHold(admin, member.user.id);
        await waitForGateWaiters();
        // Still not committed while the clean-up holds the gate.
        expect(await prisma.retentionHold.count()).toBe(0);
      });
      expect(await expirePrayers()).toBe(1);
      expect((await placing!).statusCode).toBe(201);
      expect(await prisma.retentionHold.count()).toBe(1);
    });

    it('clean-ups that start while a hold is being placed wait for it and then honour it', async () => {
      allowDeletionExecutionForTests(true);
      const admin = await as('ADMIN');
      const held = await deletedLongAgo();
      const prayer = await prisma.prayerRequest.create({
        data: {
          userId: held.id,
          text: 'Words',
          clientKey: 'closed',
          status: 'PRAYED_FOR',
          closedAt: new Date(Date.now() - 400 * DAY),
        },
      });
      const about = await recordAudit(prisma, {
        actorId: admin.user.id,
        action: 'care.prayer_status_changed',
        entityType: 'prayer',
        entityId: prayer.id,
      });
      await prisma.auditEvent.update({
        where: { id: about.id },
        data: { createdAt: ancient },
      });
      await prisma.auditEvent.create({
        data: {
          action: 'old.free',
          entityType: 'x',
          entityId: '1',
          createdAt: ancient,
        },
      });
      const open = deferred();
      const placing = prisma.$transaction(
        async (tx) => {
          await lockRetentionGate(tx, 'holds');
          await tx.retentionHold.create({
            data: {
              userId: held.id,
              reason: 'CLAIM',
              reference: 'Claim 2026-14',
              basis: 'Needed while a claim is resolved.',
              reviewBy: new Date(Date.now() + 90 * DAY),
              placedById: admin.user.id,
            },
          });
          await open.promise;
        },
        { timeout: 20_000 },
      );
      await waitForGateHeld();
      const cleanups = Promise.all([
        expirePrayers(),
        trimAuditLog(),
        purgeDeletedAccounts(),
      ]);
      await waitForGateWaiters(3);
      open.resolve();
      await placing;
      const [prayers, trim, purge] = await cleanups;
      expect(prayers).toBe(0);
      expect(trim).toMatchObject({ events: 1, held: 1 });
      expect(purge).toMatchObject({ purged: 0, held: 1 });
      expect(await prisma.user.count({ where: { id: held.id } })).toBe(1);
      expect(
        await prisma.prayerRequest.count({ where: { id: prayer.id } }),
      ).toBe(1);
      expect(await prisma.auditEvent.count({ where: { id: about.id } })).toBe(
        1,
      );
    });

    it('a hold requested while the account is being purged re-checks after the lock and finds it gone', async () => {
      allowDeletionExecutionForTests(true);
      const admin = await as('ADMIN');
      const doomed = await deletedLongAgo();
      let placing: ReturnType<typeof placeHold> | null = null;
      setRetentionPauseForTests(async (point) => {
        if (point !== 'purge.scanned' || placing) return;
        placing = placeHold(admin, doomed.id);
        await waitForGateWaiters();
      });
      expect((await purgeDeletedAccounts()).purged).toBe(1);
      const answer = await placing!;
      expect(answer.statusCode).toBe(404);
      expect(await prisma.retentionHold.count()).toBe(0);
      expect(await prisma.user.count({ where: { id: doomed.id } })).toBe(0);
    });
  });

  describe('each run is a durable, fenced job', () => {
    beforeEach(() => allowDeletionExecutionForTests(true));
    const accounts = async (count: number) => {
      for (let made = 0; made < count; made++) await deletedLongAgo();
    };
    const purgedCount = () =>
      prisma.accountDeletion.count({ where: { stage: 'PURGED' } });
    /** Pauses the first attempt before its `at`-th step, once. */
    function pauseAt(at: number) {
      const reached = deferred();
      const go = deferred();
      let steps = 0;
      setRetentionPauseForTests(async (point) => {
        if (point !== 'run.step' || ++steps !== at) return;
        reached.resolve();
        await go.promise;
      });
      return { reached: reached.promise, go: go.resolve };
    }

    it('a retry with the same key reports the finished run; it never starts another', async () => {
      const admin = await as('ADMIN');
      await accounts(2);
      const first = await run(admin, 'press-same-key');
      expect(first.json().data).toMatchObject({
        status: 'done',
        attempts: 1,
        removed: { deletedAccounts: 2 },
      });
      await accounts(1);
      const again = await run(admin, 'press-same-key');
      expect(again.json().data).toEqual(first.json().data);
      expect(await prisma.retentionRun.count()).toBe(1);
      // The new account waits for a new press.
      expect(await purgedCount()).toBe(2);
      expect(
        (await run(admin, 'press-next-key')).json().data.removed,
      ).toMatchObject({ deletedAccounts: 1 });
      expect(await prisma.retentionRun.count()).toBe(2);
    });

    it('a delayed attempt that was taken over stops: it deletes nothing more and never finishes the run', async () => {
      const admin = await as('ADMIN');
      await accounts(3);
      const pause = pauseAt(2);
      const slow = run(admin, 'press-takeover');
      await pause.reached;
      // One account done; the slow attempt's lease runs out.
      expect(await purgedCount()).toBe(1);
      await prisma.retentionRun.updateMany({
        data: { leaseUntil: new Date(Date.now() - 1000) },
      });
      const retry = await run(admin, 'press-takeover');
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data).toMatchObject({
        status: 'done',
        attempts: 2,
        removed: { deletedAccounts: 3 },
      });
      pause.go();
      const late = await slow;
      expect(late.statusCode).toBe(409);
      expect(late.json().error.code).toBe('RETENTION_TAKEN_OVER');
      const rows = await prisma.retentionRun.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: 'DONE',
        attempts: 2,
        removedAccounts: 3,
        claimToken: null,
      });
      expect(await purgedCount()).toBe(3);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'retention.run_finished' },
        }),
      ).toBe(1);
    });

    it('another press after a lease ran out fences the old run off, with exact counts on both', async () => {
      const admin = await as('ADMIN');
      await accounts(3);
      const pause = pauseAt(2);
      const slow = run(admin, 'press-old-one');
      await pause.reached;
      await prisma.retentionRun.updateMany({
        data: { leaseUntil: new Date(Date.now() - 1000) },
      });
      const fresh = await run(admin, 'press-new-one');
      expect(fresh.json().data).toMatchObject({
        status: 'done',
        removed: { deletedAccounts: 2 },
      });
      pause.go();
      expect((await slow).json().error.code).toBe('RETENTION_TAKEN_OVER');
      const old = await prisma.retentionRun.findFirstOrThrow({
        where: { requestKey: 'press-old-one' },
      });
      expect(old).toMatchObject({
        status: 'FAILED',
        failure: 'abandoned',
        removedAccounts: 1,
      });
      expect(await purgedCount()).toBe(3);
    });

    it('a failure part-way is reported as a failure with exactly what was removed; the same key resumes it', async () => {
      const admin = await as('ADMIN');
      await accounts(3);
      let scans = 0;
      setRetentionPauseForTests(async (point) => {
        // Inside the second purge transaction: it rolls back.
        if (point === 'purge.scanned' && ++scans === 2)
          throw new Error('Database went away');
      });
      const failed = await run(admin, 'press-partial');
      expect(failed.statusCode).toBe(500);
      const stopped = await prisma.retentionRun.findFirstOrThrow();
      expect(stopped).toMatchObject({
        status: 'FAILED',
        failure: 'error',
        stage: 'ACCOUNTS',
        removedAccounts: 1,
        claimToken: null,
      });
      expect(await purgedCount()).toBe(1);
      const report = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'retention.run_failed' },
      });
      expect(report.metadata).toMatchObject({
        removed: { deletedAccounts: 1 },
      });
      // The preview shows the failed run's real counts.
      expect(
        (await call('GET', '/v1/staff/retention', admin)).json().data.lastRun,
      ).toMatchObject({ status: 'failed', removed: { deletedAccounts: 1 } });
      setRetentionPauseForTests(null);
      const resumed = await run(admin, 'press-partial');
      expect(resumed.json().data).toMatchObject({
        status: 'done',
        attempts: 2,
        removed: { deletedAccounts: 3 },
      });
      expect(await prisma.retentionRun.count()).toBe(1);
      expect(await purgedCount()).toBe(3);
    });

    it('destructive steps re-check the staff member: losing access mid-run stops it', async () => {
      const admin = await as('ADMIN');
      await accounts(3);
      let steps = 0;
      setRetentionPauseForTests(async (point) => {
        if (point === 'run.step' && ++steps === 2)
          await prisma.user.update({
            where: { id: admin.user.id },
            data: { status: 'SUSPENDED' },
          });
      });
      const stopped = await run(admin, 'press-suspended');
      expect([401, 403]).toContain(stopped.statusCode);
      expect(await prisma.retentionRun.findFirstOrThrow()).toMatchObject({
        status: 'FAILED',
        removedAccounts: 1,
      });
      expect(await purgedCount()).toBe(1);
      expect(
        await prisma.user.count({ where: { status: 'DELETION_PENDING' } }),
      ).toBe(2);
    });
  });
});
