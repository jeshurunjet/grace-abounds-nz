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
import { prisma } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';
import { addDays, nextSunday, nzNow } from '@grace-abounds/validation';
import { buildApp } from './app.js';
import { setStorage } from './lib/storage.js';
import { MemoryStorage } from './lib/storage-memory.js';
import { processExports } from './lib/data-export.js';
import { STORAGE_REMOVE } from './lib/assets.js';
import type { EmailMessage } from './lib/email.js';
import { expireAppointments } from './lib/care-retention.js';
import {
  ACCOUNT_NOTICE,
  allowDeletionExecutionForTests,
  deletionNoticeSender,
  NOTICE_MAX_ATTEMPTS,
  purgeDeletedAccounts,
  trimAuditLog,
} from './lib/account-deletion.js';

/*
 * Phase 5C: member account deletion under the owner's policy. No grace
 * period: recent sign-in plus typed DELETE (or staff at the member's
 * recorded request) removes access at once, clears identifiers and
 * credentials, releases upcoming bookings, closes open appointments, ends
 * exports and sends a mandatory notice; what remains shows as "Deleted
 * user" and is purged after 30 days without touching church content.
 * Fixed staff are never deletable. Real execution is disabled outside
 * tests, including the purge and the rolling-year audit trim.
 */

const DAY = 86_400_000;
const sunday = addDays(nextSunday(nzNow().date), 7);
const lastSunday = addDays(nextSunday(nzNow().date), -7);
const activityBody = {
  kind: 'event',
  title: 'Family Night',
  summary: '',
  leader: '',
  tag: '',
  locationId: '',
  venue: 'Main hall',
  image: '',
  schedule: {
    repeat: 'weekly',
    date: '2026-01-04',
    until: '',
    days: [0],
    monthWeek: 1,
    monthDay: 0,
    startTime: '18:00',
    endTime: '20:00',
  },
  joinMode: 'booking',
  capacity: 1,
  status: 'published',
  publishAt: '',
};

describe.skipIf(!dbTestsEnabled)('account deletion (PostgreSQL)', () => {
  const app = buildApp();
  let storage: MemoryStorage;
  beforeAll(() => app.ready());
  beforeEach(async () => {
    await resetIdentityTables();
    allowDeletionExecutionForTests(false);
    storage = new MemoryStorage();
    setStorage(storage);
  });
  afterEach(() => {
    allowDeletionExecutionForTests(false);
    setStorage(undefined);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function headersFor(userId: string, authenticatedAt?: Date) {
    const session = await createSession(userId, { authenticatedAt });
    const token = await new SignJWT({
      sid: session.id,
      sv: session.sessionVersion,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('grace-web')
      .setAudience('grace-api')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(new TextEncoder().encode(process.env.API_ASSERTION_SECRET!));
    return { authorization: `Bearer ${token}` };
  }
  async function as(
    role: 'MEMBER' | 'ADMIN' | 'PASTOR' = 'MEMBER',
    authenticatedAt?: Date,
  ) {
    const user = await createUser({ role });
    return { user, headers: await headersFor(user.id, authenticatedAt) };
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
  const deleteSelf = (who: Who, body: unknown = { confirm: 'DELETE' }) =>
    call('POST', '/v1/me/deletion', who, body);
  const deleteByStaff = (
    who: Who,
    id: string,
    body: unknown = {
      confirm: 'DELETE',
      memberRequested: true,
      requestNote: 'Phoned the office',
    },
  ) => call('POST', `/v1/staff/members/${id}/deletion`, who, body);
  const createActivity = async (admin: Who) => {
    const response = await call(
      'POST',
      '/v1/staff/activities',
      admin,
      activityBody,
    );
    expect(response.statusCode).toBe(201);
    return response.json().data.id as string;
  };
  const book = (who: Who, activityId: string, date = sunday) =>
    call('POST', '/v1/member/participations', who, { activityId, date });

  /** A member with real records: bookings, care, an export, notifications. */
  async function memberWithRecords() {
    const [anna, admin, pastor] = [
      await as(),
      await as('ADMIN'),
      await as('PASTOR'),
    ];
    await prisma.user.update({
      where: { id: anna.user.id },
      data: {
        name: 'Anna Example',
        phone: '021 000 0000',
        bio: 'Loves singing',
        passwordHash: 'argon2-secret-hash',
      },
    });
    await prisma.account.create({
      data: {
        userId: anna.user.id,
        type: 'oidc',
        provider: 'google',
        providerAccountId: 'google-anna',
      },
    });
    const activityId = await createActivity(admin);
    expect((await book(anna, activityId)).statusCode).toBe(201);
    // A past booking: history, not cancelled.
    const past = await prisma.participation.create({
      data: { activityId, userId: anna.user.id, dateKey: lastSunday },
    });
    const appointment = (
      await call('POST', '/v1/member/appointments', anna, {
        topic: 'Prayer',
        reason: 'Private appointment reason',
        preferredDate: '',
        preferredTime: 'any',
        clientKey: 'appt-key-0001',
      })
    ).json().data.id as string;
    const prayer = (
      await call('POST', '/v1/member/prayers', anna, {
        text: 'Private prayer words',
        clientKey: 'prayer-key-01',
      })
    ).json().data.id as string;
    await call(
      'PUT',
      '/v1/me/preferences',
      anna,
      { emailCare: true, emailAccount: true },
      1,
    );
    const exportId = (await call('POST', '/v1/me/exports', anna)).json().data
      .id as string;
    await processExports({ storage });
    return {
      anna,
      admin,
      pastor,
      activityId,
      past,
      appointment,
      prayer,
      exportId,
      email: anna.user.email,
    };
  }

  it('is switched off outside tests: nothing changes, no purge, no audit trim', async () => {
    const [anna, admin] = [await as(), await as('ADMIN')];
    const self = await deleteSelf(anna);
    expect(self.statusCode).toBe(503);
    expect(self.json().error.code).toBe('DELETION_UNAVAILABLE');
    expect((await deleteByStaff(admin, anna.user.id)).statusCode).toBe(503);
    expect((await call('GET', '/v1/me', anna)).statusCode).toBe(200);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: anna.user.id } }),
    ).toMatchObject({ status: 'ACTIVE', email: anna.user.email });
    expect(await prisma.accountDeletion.count()).toBe(0);
    expect(
      await purgeDeletedAccounts(new Date(Date.now() + 99 * DAY)),
    ).toMatchObject({ skipped: true, purged: 0 });
    expect((await trimAuditLog()).skipped).toBe(true);
    // Only the test runner can switch it on; there is no setting for it.
    const runner = process.env.VITEST;
    delete process.env.VITEST;
    try {
      expect(() => allowDeletionExecutionForTests(true)).toThrow();
    } finally {
      process.env.VITEST = runner;
    }
  });

  it('self-service needs a recent sign-in and typed DELETE; staff accounts are refused', async () => {
    allowDeletionExecutionForTests(true);
    const stale = await as('MEMBER', new Date(Date.now() - 60 * 60_000));
    expect((await deleteSelf(stale)).json().error.code).toBe('REAUTH_REQUIRED');
    const anna = await as();
    expect((await deleteSelf(anna, {})).statusCode).toBe(422);
    expect((await deleteSelf(anna, { confirm: 'delete' })).statusCode).toBe(
      422,
    );
    for (const role of ['PASTOR', 'ADMIN'] as const) {
      const staff = await as(role);
      const refused = await deleteSelf(staff);
      expect(refused.statusCode).toBe(403);
      expect(refused.json().error.code).toBe('STAFF_PROTECTED');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: staff.user.id } }))
          .status,
      ).toBe('ACTIVE');
    }
    expect(await prisma.accountDeletion.count()).toBe(0);
  });

  it('removes access at once and does the follow-up in one step', async () => {
    allowDeletionExecutionForTests(true);
    const r = await memberWithRecords();
    const otherDevice = await headersFor(r.anna.user.id);
    const before = Date.now();
    const done = await deleteSelf(r.anna);
    expect(done.statusCode).toBe(200);
    expect(done.json().data).toMatchObject({ via: 'self', purgedAt: '' });
    const purgeAfter = new Date(done.json().data.purgeAfter).getTime();
    expect(purgeAfter - before).toBeGreaterThanOrEqual(30 * DAY - 1000);
    expect(purgeAfter - before).toBeLessThan(30 * DAY + 60_000);

    // Signed out everywhere; sign-in blocked.
    expect((await call('GET', '/v1/me', r.anna)).statusCode).toBe(403);
    expect(
      (await call('GET', '/v1/me', { ...r.anna, headers: otherDevice }))
        .statusCode,
    ).toBe(403);
    // Every session that existed before the deletion was revoked.
    expect(
      await prisma.userSession.count({
        where: { userId: r.anna.user.id, revokedAt: null },
      }),
    ).toBe(0);
    // Even a session fabricated afterwards (sign-in itself refuses this
    // account) gets nothing from the API.
    const fabricated = await headersFor(r.anna.user.id);
    expect(
      (await call('GET', '/v1/me', { ...r.anna, headers: fabricated }))
        .statusCode,
    ).toBe(403);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: r.anna.user.id },
    });
    expect(user).toMatchObject({
      status: 'DELETION_PENDING',
      email: `deleted+${r.anna.user.id}@deleted.invalid`,
      name: null,
      phone: '',
      bio: '',
      passwordHash: null,
      emailVerified: null,
    });
    expect(
      await prisma.account.count({ where: { userId: r.anna.user.id } }),
    ).toBe(0);

    // Upcoming booking cancelled and its place released; history kept.
    expect(
      await prisma.participation.findMany({
        where: { userId: r.anna.user.id },
        select: { dateKey: true, status: true },
        orderBy: { dateKey: 'asc' },
      }),
    ).toEqual([
      { dateKey: lastSunday, status: 'ACTIVE' },
      { dateKey: sunday, status: 'CANCELLED' },
    ]);
    const ben = await as();
    expect((await book(ben, r.activityId)).statusCode).toBe(201);

    // Open appointment closed; staff told without any private detail.
    expect(
      await prisma.appointment.findUniqueOrThrow({
        where: { id: r.appointment },
      }),
    ).toMatchObject({ status: 'CANCELLED' });
    const told = await prisma.notification.findMany({
      where: {
        entityId: r.appointment,
        title: 'An appointment was cancelled',
      },
    });
    expect(told.map((row) => row.userId).sort()).toEqual(
      [r.admin.user.id, r.pastor.user.id].sort(),
    );
    expect(JSON.stringify(told)).not.toContain('Private');
    // Prayer kept (as "Deleted user") until the purge.
    expect(await prisma.prayerRequest.count({ where: { id: r.prayer } })).toBe(
      1,
    );

    // Export ended, its file queued for removal.
    expect(
      await prisma.dataExport.findUniqueOrThrow({ where: { id: r.exportId } }),
    ).toMatchObject({ status: 'EXPIRED', storageKey: null });
    const file = await prisma.dataExportFile.findFirstOrThrow();
    expect(file.removedAt).not.toBeNull();
    expect(
      await prisma.outboxEvent.count({
        where: {
          topic: STORAGE_REMOVE,
          payload: { equals: { key: file.key } },
        },
      }),
    ).toBe(1);

    // Own updates and choices gone.
    expect(
      await prisma.notification.count({ where: { userId: r.anna.user.id } }),
    ).toBe(0);
    expect(
      await prisma.notificationPreference.count({
        where: { userId: r.anna.user.id },
      }),
    ).toBe(0);
    expect(
      await prisma.emailDelivery.count({ where: { userId: r.anna.user.id } }),
    ).toBe(0);

    // A content-free record, an audit entry and a queued notice.
    const record = await prisma.accountDeletion.findUniqueOrThrow({
      where: { userId: r.anna.user.id },
    });
    expect(record).toMatchObject({
      via: 'self',
      requestedById: r.anna.user.id,
      stage: 'ACCESS_REMOVED',
      noticeEmail: r.email,
    });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'account.deletion_requested' },
    });
    expect(audit.metadata).toEqual({
      via: 'self',
      bookingsCancelled: 1,
      appointmentsClosed: 1,
      exportsEnded: 1,
    });
    expect(JSON.stringify(audit)).not.toContain(r.email);
    expect(
      await prisma.outboxEvent.count({ where: { topic: ACCOUNT_NOTICE } }),
    ).toBe(1);
  });

  it('staff delete only at the member’s recorded request; staff and guessed ids are refused', async () => {
    allowDeletionExecutionForTests(true);
    const [anna, admin, pastor] = [
      await as(),
      await as('ADMIN'),
      await as('PASTOR'),
    ];
    const member = await as();
    expect(
      (
        await deleteByStaff(admin, anna.user.id, {
          confirm: 'DELETE',
          requestNote: 'Phoned the office',
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await deleteByStaff(admin, anna.user.id, {
          confirm: 'DELETE',
          memberRequested: true,
          requestNote: 'x',
        })
      ).statusCode,
    ).toBe(422);
    expect((await deleteByStaff(member, anna.user.id)).statusCode).toBe(403);
    for (const [who, target] of [
      [admin, pastor.user.id],
      [pastor, admin.user.id],
      [admin, admin.user.id],
    ] as const) {
      const refused = await deleteByStaff(who, target);
      expect(refused.json().error.code).toBe('STAFF_PROTECTED');
    }
    expect((await deleteByStaff(admin, 'guessed-id')).statusCode).toBe(404);
    const staleAdmin = await as('ADMIN', new Date(Date.now() - 60 * 60_000));
    expect(
      (await deleteByStaff(staleAdmin, anna.user.id)).json().error.code,
    ).toBe('REAUTH_REQUIRED');
    expect(await prisma.accountDeletion.count()).toBe(0);

    const done = await deleteByStaff(admin, anna.user.id);
    expect(done.statusCode).toBe(200);
    expect(
      await prisma.accountDeletion.findUniqueOrThrow({
        where: { userId: anna.user.id },
      }),
    ).toMatchObject({
      via: 'staff',
      requestedById: admin.user.id,
      requestNote: 'Phoned the office',
    });
    // Asking again changes nothing.
    expect((await deleteByStaff(pastor, anna.user.id)).statusCode).toBe(200);
    expect(await prisma.accountDeletion.count()).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { action: 'account.deletion_requested' },
      }),
    ).toBe(1);
    for (const id of [admin.user.id, pastor.user.id])
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id } })).status,
      ).toBe('ACTIVE');
  });

  it('what remains shows as “Deleted user” without contact details', async () => {
    allowDeletionExecutionForTests(true);
    const r = await memberWithRecords();
    await deleteByStaff(r.admin, r.anna.user.id);
    const appointments = (
      await call('GET', '/v1/staff/appointments', r.pastor)
    ).json().data;
    expect(appointments[0].member).toEqual({
      name: 'Deleted user',
      email: '',
      phone: '',
    });
    const prayers = (await call('GET', '/v1/pastor/prayers', r.pastor)).json()
      .data;
    expect(prayers[0].member).toEqual({ name: 'Deleted user', email: '' });
    const person = (
      await call('GET', `/v1/staff/members/${r.anna.user.id}`, r.admin)
    ).json().data;
    expect(person).toMatchObject({
      name: 'Deleted user',
      email: '',
      phone: '',
      status: 'deletion_pending',
      manageable: false,
      deletion: { via: 'staff' },
    });
    const roster = (
      await call('GET', `/v1/staff/activities/${r.activityId}/roster`, r.admin)
    ).json().data;
    expect(
      roster.every((row: { name: string }) => row.name === 'Deleted user'),
    ).toBe(true);
    expect(JSON.stringify(roster)).not.toContain(r.email);
    // Staff can't act on its closed appointment any more.
    expect(
      (
        await call(
          'POST',
          `/v1/staff/appointments/${r.appointment}/cancel`,
          r.pastor,
          {},
          appointments[0].version,
        )
      ).statusCode,
    ).toBe(409);
  });

  describe('effective retention dates', () => {
    it('a deleted user’s records show when they are really removed; others keep their own windows', async () => {
      allowDeletionExecutionForTests(true);
      const [anna, ben, pastor] = [await as(), await as(), await as('PASTOR')];
      const submit = (who: Who, key: string) =>
        call('POST', '/v1/member/prayers', who, {
          text: 'Words',
          clientKey: key,
        }).then((response) => response.json().data.id as string);
      const annaOpen = await submit(anna, 'anna-open-1');
      const annaClosed = await submit(anna, 'anna-closed1');
      const benClosed = await submit(ben, 'ben-closed-1');
      const benOpen = await submit(ben, 'ben-open-001');
      // Closed long ago: its own 12-month date comes before the purge.
      const almostYear = new Date(Date.now() - 360 * DAY);
      for (const id of [annaClosed, benClosed])
        await prisma.prayerRequest.update({
          where: { id },
          data: { status: 'PRAYED_FOR', closedAt: almostYear },
        });
      await deleteSelf(anna);
      const { purgeAfter } = await prisma.accountDeletion.findUniqueOrThrow({
        where: { userId: anna.user.id },
      });
      const list = (await call('GET', '/v1/pastor/prayers', pastor)).json()
        .data as { id: string; deleteAfter: string }[];
      const after = (id: string) =>
        list.find((item) => item.id === id)!.deleteAfter;
      const ownClosed = new Date(almostYear);
      ownClosed.setUTCMonth(ownClosed.getUTCMonth() + 12);
      // Open: removed with the account.
      expect(after(annaOpen)).toBe(purgeAfter.toISOString());
      // Closed: whichever comes first.
      expect(after(annaClosed)).toBe(ownClosed.toISOString());
      // Not deleted: unchanged windows.
      expect(after(benClosed)).toBe(ownClosed.toISOString());
      expect(after(benOpen)).toBe('');
      expect(
        (await call('GET', `/v1/pastor/prayers/${annaOpen}`, pastor)).json()
          .data.deleteAfter,
      ).toBe(purgeAfter.toISOString());
    });

    it('a cancelled future appointment no longer delays the purge: exactly 30 days (owner policy)', async () => {
      allowDeletionExecutionForTests(true);
      const [anna, pastor, admin] = [
        await as(),
        await as('PASTOR'),
        await as('ADMIN'),
      ];
      const startsAt = new Date(Date.now() + 60 * DAY);
      const appointment = await prisma.appointment.create({
        data: {
          userId: anna.user.id,
          topic: 'Prayer',
          clientKey: 'future-appt',
          status: 'CONFIRMED',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        },
      });
      const done = await deleteSelf(anna);
      const { requestedAt, purgeAfter } = done.json().data;
      expect(Date.parse(purgeAfter) - Date.parse(requestedAt)).toBe(30 * DAY);
      // Every staff view tells the same (earlier) date.
      expect(
        (await call('GET', `/v1/staff/members/${anna.user.id}`, admin)).json()
          .data.deletion.purgeAfter,
      ).toBe(purgeAfter);
      expect(
        (
          await call('GET', `/v1/staff/appointments/${appointment.id}`, pastor)
        ).json().data.deleteAfter,
      ).toBe(purgeAfter);
      // Purged after 30 days, well before the original appointment time.
      expect(
        (await purgeDeletedAccounts(new Date(Date.parse(purgeAfter) + 1000)))
          .purged,
      ).toBe(1);
      expect(
        await prisma.appointment.count({ where: { id: appointment.id } }),
      ).toBe(0);
    });

    it('ordinary retention keeps its not-before-the-appointment-time rule', async () => {
      const ben = await as();
      const startsAt = new Date(Date.now() + 60 * DAY);
      const kept = await prisma.appointment.create({
        data: {
          userId: ben.user.id,
          topic: 'Prayer',
          clientKey: 'ben-future',
          status: 'CANCELLED',
          closedAt: new Date(),
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        },
      });
      expect(await expireAppointments(new Date(Date.now() + 31 * DAY))).toBe(0);
      expect(await prisma.appointment.count({ where: { id: kept.id } })).toBe(
        1,
      );
      expect(
        await expireAppointments(new Date(startsAt.getTime() + 1000)),
      ).toBe(1);
    });

    it('with no later appointment, the purge is exactly 30 days after the request', async () => {
      allowDeletionExecutionForTests(true);
      const anna = await as();
      await prisma.appointment.create({
        data: {
          userId: anna.user.id,
          topic: 'Prayer',
          clientKey: 'past-closed',
          status: 'COMPLETED',
          closedAt: new Date(Date.now() - 10 * DAY),
        },
      });
      const done = await deleteSelf(anna);
      const { requestedAt, purgeAfter } = done.json().data;
      expect(Date.parse(purgeAfter) - Date.parse(requestedAt)).toBe(30 * DAY);
    });
  });

  describe('races', () => {
    it('a booking racing the deletion never leaves an active place', async () => {
      allowDeletionExecutionForTests(true);
      const admin = await as('ADMIN');
      const activityId = await createActivity(admin);
      for (let round = 0; round < 3; round++) {
        const anna = await as();
        await prisma.participation.deleteMany({ where: { activityId } });
        const [booked, deleted] = await Promise.all([
          book(anna, activityId),
          deleteSelf(anna),
        ]);
        expect(deleted.statusCode).toBe(200);
        expect([201, 401, 403]).toContain(booked.statusCode);
        expect(
          await prisma.participation.count({
            where: { userId: anna.user.id, status: 'ACTIVE' },
          }),
        ).toBe(0);
      }
    });

    it('self and staff deleting at once: one deletion, done once', async () => {
      allowDeletionExecutionForTests(true);
      const [anna, admin] = [await as(), await as('ADMIN')];
      const [self, staff] = await Promise.all([
        deleteSelf(anna),
        deleteByStaff(admin, anna.user.id),
      ]);
      expect([self.statusCode, staff.statusCode]).toContain(200);
      for (const response of [self, staff])
        expect([200, 401, 403]).toContain(response.statusCode);
      expect(await prisma.accountDeletion.count()).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'account.deletion_requested' },
        }),
      ).toBe(1);
    });

    it('an export being built when the account is deleted is never made ready', async () => {
      allowDeletionExecutionForTests(true);
      class HoldingStorage extends MemoryStorage {
        gate: Promise<void> | null = null;
        started: (() => void) | null = null;
        override async put(key: string, body: Uint8Array, type: string) {
          const gate = this.gate;
          this.gate = null;
          if (gate) {
            this.started?.();
            await gate;
          }
          return super.put(key, body, type);
        }
      }
      const holding = new HoldingStorage();
      setStorage(holding);
      const anna = await as();
      const exportId = (await call('POST', '/v1/me/exports', anna)).json().data
        .id as string;
      let release!: () => void;
      holding.gate = new Promise<void>((resolve) => (release = resolve));
      const started = new Promise<void>(
        (resolve) => (holding.started = resolve),
      );
      const building = processExports({ storage: holding, limit: 1 });
      await started;
      expect((await deleteSelf(anna)).statusCode).toBe(200);
      release();
      await building;
      expect(
        await prisma.dataExport.findUniqueOrThrow({ where: { id: exportId } }),
      ).toMatchObject({ status: 'FAILED', storageKey: null });
      expect(
        await prisma.notification.count({ where: { entityId: exportId } }),
      ).toBe(0);
      expect(
        (await prisma.dataExportFile.findFirstOrThrow()).removedAt,
      ).not.toBeNull();
    });
  });

  it('the mandatory notice is sent once to the old address, retried, then given up', async () => {
    allowDeletionExecutionForTests(true);
    const [anna, ben, admin] = [await as(), await as(), await as('ADMIN')];
    await deleteSelf(anna);
    await deleteByStaff(admin, ben.user.id);
    const events = (
      await prisma.outboxEvent.findMany({ where: { topic: ACCOUNT_NOTICE } })
    ).map((event) => ({
      id: event.id,
      topic: event.topic,
      payload: event.payload,
      attempts: event.attempts,
    }));
    const sent: EmailMessage[] = [];
    let failures = 1;
    const send = async (message: EmailMessage) => {
      if (failures-- > 0) throw new Error('provider unavailable');
      sent.push(message);
      return 'provider-id';
    };
    const handler = deletionNoticeSender(send);
    await expect(handler(events)).rejects.toThrow('provider unavailable');
    await handler(events);
    await handler(events);
    expect(sent.map((message) => message.to).sort()).toEqual(
      [anna.user.email, ben.user.email].sort(),
    );
    const annaNotice = sent.find((message) => message.to === anna.user.email)!;
    expect(annaNotice.text).toContain('You deleted it on');
    // Access ends at once; removal is due from the 30-day date (deleted by
    // the next due-only clean-up, held records kept), never promised.
    expect(annaNotice.text).toContain('signed out everywhere');
    expect(annaNotice.text).toContain('for 30 days. From ');
    expect(annaNotice.text).toContain('they are due for removal');
    expect(annaNotice.text).toContain(
      'kept, with restricted access, only while that need is reviewed',
    );
    expect(annaNotice.text).not.toMatch(/removed for good|until .* and then/);
    expect(annaNotice.html).not.toContain('removed for good');
    const benNotice = sent.find((message) => message.to === ben.user.email)!;
    expect(benNotice.text).toContain('Church staff deleted it');
    expect(
      await prisma.accountDeletion.count({ where: { noticeEmail: null } }),
    ).toBe(2);

    // A notice that keeps failing is given up, and the address forgotten.
    const cara = await as();
    await deleteSelf(cara);
    const [caraEvent] = await prisma.outboxEvent.findMany({
      where: { topic: ACCOUNT_NOTICE },
      orderBy: { id: 'desc' },
      take: 1,
    });
    const failing = deletionNoticeSender(async () => {
      throw new Error('provider unavailable');
    });
    const one = [
      {
        id: caraEvent!.id,
        topic: caraEvent!.topic,
        payload: caraEvent!.payload,
        attempts: 0,
      },
    ];
    for (let attempt = 1; attempt < NOTICE_MAX_ATTEMPTS; attempt++)
      await expect(failing(one)).rejects.toThrow();
    await failing(one);
    expect(
      await prisma.accountDeletion.findUniqueOrThrow({
        where: { userId: cara.user.id },
      }),
    ).toMatchObject({ noticeEmail: null, noticeSentAt: null });
  });

  describe('purge after 30 days (test-only execution)', () => {
    it('removes the account and everything kept for it, never church content', async () => {
      allowDeletionExecutionForTests(true);
      const r = await memberWithRecords();
      await deleteSelf(r.anna);
      const { purgeAfter } = await prisma.accountDeletion.findUniqueOrThrow({
        where: { userId: r.anna.user.id },
      });
      expect(
        await purgeDeletedAccounts(new Date(purgeAfter.getTime() - 1000)),
      ).toMatchObject({ skipped: false, purged: 0 });

      // With execution switched off again, nothing is purged.
      allowDeletionExecutionForTests(false);
      expect(
        (await purgeDeletedAccounts(new Date(purgeAfter.getTime() + 1000)))
          .skipped,
      ).toBe(true);
      allowDeletionExecutionForTests(true);

      expect(
        await purgeDeletedAccounts(new Date(purgeAfter.getTime() + 1000)),
      ).toMatchObject({ skipped: false, purged: 1 });
      expect(await prisma.user.count({ where: { id: r.anna.user.id } })).toBe(
        0,
      );
      for (const count of [
        prisma.participation.count({ where: { userId: r.anna.user.id } }),
        prisma.prayerRequest.count({ where: { id: r.prayer } }),
        prisma.appointment.count({ where: { id: r.appointment } }),
        prisma.dataExport.count({ where: { id: r.exportId } }),
        prisma.notification.count({ where: { entityId: r.appointment } }),
        prisma.notification.count({ where: { entityId: r.prayer } }),
      ])
        expect(await count).toBe(0);
      // Church content stays; the audit trail stays, actor cleared.
      expect(await prisma.activity.count({ where: { id: r.activityId } })).toBe(
        1,
      );
      const requested = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'account.deletion_requested' },
      });
      expect(requested.actorId).toBeNull();
      expect(
        await prisma.accountDeletion.findUniqueOrThrow({
          where: { userId: r.anna.user.id },
        }),
      ).toMatchObject({ stage: 'PURGED', noticeEmail: null, requestNote: '' });
      // Idempotent.
      expect(
        await purgeDeletedAccounts(new Date(purgeAfter.getTime() + 2000)),
      ).toMatchObject({ skipped: false, purged: 0 });
    });

    it('never purges an account that isn’t a deleted member', async () => {
      allowDeletionExecutionForTests(true);
      const anna = await as();
      await prisma.accountDeletion.create({
        data: {
          userId: anna.user.id,
          via: 'self',
          requestedById: anna.user.id,
          purgeAfter: new Date(Date.now() - DAY),
        },
      });
      expect((await purgeDeletedAccounts()).purged).toBe(0);
      expect(await prisma.user.count({ where: { id: anna.user.id } })).toBe(1);
    });
  });

  it('the activity log follows calendar-year retention (test-only execution)', async () => {
    // 15 January 2027, NZ: records from 2025 and earlier are eligible.
    const now = new Date('2027-01-15T00:00:00.000Z');
    await prisma.auditEvent.createMany({
      data: [
        {
          action: 'end.of.2025',
          entityType: 'x',
          entityId: '1',
          // 31 December 2025, 23:59 NZDT.
          createdAt: new Date('2025-12-31T10:59:00.000Z'),
        },
        {
          action: 'start.of.2026',
          entityType: 'x',
          entityId: '2',
          // 1 January 2026, 00:00 NZDT.
          createdAt: new Date('2025-12-31T11:00:00.000Z'),
        },
      ],
    });
    await prisma.accountDeletion.create({
      data: {
        userId: 'long-gone',
        via: 'self',
        requestedById: 'long-gone',
        stage: 'PURGED',
        purgeAfter: new Date('2025-05-01T00:00:00.000Z'),
        purgedAt: new Date('2025-06-01T00:00:00.000Z'),
      },
    });
    expect((await trimAuditLog(now)).skipped).toBe(true);
    expect(await prisma.auditEvent.count()).toBe(2);
    allowDeletionExecutionForTests(true);
    expect(await trimAuditLog(now)).toMatchObject({
      skipped: false,
      events: 1,
      deletions: 1,
      held: 0,
    });
    expect(
      (await prisma.auditEvent.findMany()).map((row) => row.action),
    ).toEqual(['start.of.2026']);
  });
});
