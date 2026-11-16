// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { prisma } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';
import { addDays, nextSunday, nzNow } from '@grace-abounds/validation';
import { buildApp } from './app.js';

/*
 * Phase 3B: joining and booking are server records. The last place can't
 * be taken twice, a retry never books twice, people cancel only their own,
 * only published, real, upcoming, open dates can be booked, staff edits
 * can't strand bookings, and public data has counts but never people.
 */

// Two Sundays ahead, so the test never depends on the time of day.
const sunday = addDays(nextSunday(nzNow().date), 7);
const lastSunday = addDays(nextSunday(nzNow().date), -7);

const base = {
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
  capacity: 3,
  status: 'published',
  publishAt: '',
};

describe.skipIf(!dbTestsEnabled)('joining and booking (PostgreSQL)', () => {
  const app = buildApp();
  beforeAll(() => app.ready());
  beforeEach(resetIdentityTables);
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function as(role: 'MEMBER' | 'ADMIN' | 'PASTOR') {
    const user = await createUser({ role });
    const session = await createSession(user.id);
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
  const create = async (admin: Who, over: object = {}) => {
    const response = await call('POST', '/v1/staff/activities', admin, {
      ...base,
      ...over,
    });
    expect(response.statusCode).toBe(201);
    return response.json().data as { id: string; version: number };
  };
  const book = (who: Who, activityId: string, date = sunday) =>
    call('POST', '/v1/member/participations', who, { activityId, date });
  const save = (
    admin: Who,
    id: string,
    version: number,
    over: Record<string, unknown>,
  ) =>
    call(
      'PATCH',
      `/v1/staff/activities/${id}`,
      admin,
      { ...base, ...over },
      version,
    );
  const active = (activityId: string, dateKey = sunday) =>
    prisma.participation.count({
      where: { activityId, dateKey, status: 'ACTIVE' },
    });

  it('books, retries safely, and cancels only their own', async () => {
    const admin = await as('ADMIN');
    const [anna, ben] = [await as('MEMBER'), await as('MEMBER')];
    const night = await create(admin);

    const first = await book(anna, night.id);
    expect(first.statusCode).toBe(201);
    const plan = first.json().data;
    expect(plan).toMatchObject({
      activityId: night.id,
      date: sunday,
      available: true,
      dateCancelled: false,
    });
    // A retry (or a double click) returns the same booking.
    const retry = await book(anna, night.id);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.id).toBe(plan.id);
    expect(await active(night.id)).toBe(1);

    // Ben can't see or cancel Anna's booking.
    expect(
      (await call('DELETE', `/v1/member/participations/${plan.id}`, ben))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('GET', '/v1/member/participations', ben)).json().data,
    ).toEqual([]);
    expect(
      (await call('GET', '/v1/member/participations', anna)).json().data,
    ).toHaveLength(1);

    // Cancelling twice is fine; the row stays as history.
    for (let i = 0; i < 2; i++)
      expect(
        (await call('DELETE', `/v1/member/participations/${plan.id}`, anna))
          .statusCode,
      ).toBe(204);
    expect(await active(night.id)).toBe(0);
    // Booking again brings the same place back.
    const again = await book(anna, night.id);
    expect(again.statusCode).toBe(201);
    expect(again.json().data.id).toBe(plan.id);
    const events = await prisma.participationEvent.findMany({
      where: { participationId: plan.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((item) => item.action)).toEqual([
      'booked',
      'cancelled',
      'booked',
    ]);
    expect(
      await prisma.auditEvent.count({
        where: {
          entityId: plan.id,
          action: { in: ['activity.booked', 'activity.booking_cancelled'] },
        },
      }),
    ).toBe(3);
    expect(
      (
        await call('POST', '/v1/member/participations', undefined, {
          activityId: night.id,
          date: sunday,
        })
      ).statusCode,
    ).toBe(401);
  });

  it('the last place goes to exactly one person', async () => {
    const admin = await as('ADMIN');
    const night = await create(admin, { capacity: 1 });
    const people = await Promise.all(
      Array.from({ length: 6 }, () => as('MEMBER')),
    );
    const results = await Promise.all(people.map((who) => book(who, night.id)));
    const codes = results.map((item) => item.statusCode).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409, 409]);
    for (const refused of results.filter((item) => item.statusCode === 409))
      expect(refused.json().error.code).toBe('FULL');
    expect(await active(night.id)).toBe(1);

    // Two simultaneous retries by one person: one place, one row.
    const roomy = await create(admin, { title: 'Roomy night', capacity: 5 });
    const [a, b] = await Promise.all([
      book(people[1]!, roomy.id),
      book(people[1]!, roomy.id),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(
      await prisma.participation.count({ where: { activityId: roomy.id } }),
    ).toBe(1);
  });

  it('only published, real, upcoming, open dates can be booked', async () => {
    const admin = await as('ADMIN');
    const anna = await as('MEMBER');
    const draft = await create(admin, { status: 'draft' });
    const later = await create(admin, {
      title: 'Later',
      publishAt: '2099-12-01T09:00',
    });
    const open = await create(admin, { title: 'Open night' });
    const noSignUp = await create(admin, {
      title: 'Drop in',
      joinMode: 'none',
      capacity: null,
    });
    const group = await create(admin, {
      title: 'Home group',
      kind: 'group',
      joinMode: 'membership',
      capacity: 10,
    });

    expect((await book(anna, draft.id)).statusCode).toBe(404);
    expect((await book(anna, later.id)).statusCode).toBe(404);
    expect((await book(anna, 'no-such-activity')).statusCode).toBe(404);
    const closed = await book(anna, noSignUp.id);
    expect(closed.statusCode).toBe(409);
    expect(closed.json().error.code).toBe('NOT_OPEN');
    // A Monday isn't one of its dates; last Sunday has passed.
    expect((await book(anna, open.id, addDays(sunday, 1))).statusCode).toBe(
      422,
    );
    const past = await book(anna, open.id, lastSunday);
    expect(past.statusCode).toBe(409);
    expect(past.json().error.code).toBe('PAST');
    // A cancelled date takes no bookings.
    await call(
      'PUT',
      `/v1/staff/activities/${open.id}/exceptions/${sunday}`,
      admin,
      {
        kind: 'cancelled',
        note: 'Hall closed',
        startTime: '',
        endTime: '',
        venue: '',
      },
      1,
    );
    const cancelled = await book(anna, open.id);
    expect(cancelled.statusCode).toBe(409);
    expect(cancelled.json().error.code).toBe('DATE_CANCELLED');
    // A group is joined, not booked by date.
    expect((await book(anna, group.id, sunday)).statusCode).toBe(422);
    expect((await book(anna, group.id, '')).statusCode).toBe(201);
  });

  it('a group counts its members against its places', async () => {
    const admin = await as('ADMIN');
    const [anna, ben] = [await as('MEMBER'), await as('MEMBER')];
    const group = await create(admin, {
      kind: 'group',
      joinMode: 'membership',
      capacity: 1,
    });
    const joined = await book(anna, group.id, '');
    expect(joined.statusCode).toBe(201);
    const full = await book(ben, group.id, '');
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe('FULL');
    await call(
      'DELETE',
      `/v1/member/participations/${joined.json().data.id}`,
      anna,
    );
    expect((await book(ben, group.id, '')).statusCode).toBe(201);
  });

  it('staff edits can’t strand bookings; one date can be cancelled', async () => {
    const admin = await as('ADMIN');
    const [anna, ben] = [await as('MEMBER'), await as('MEMBER')];
    const night = await create(admin);
    await book(anna, night.id);
    await book(ben, night.id);

    const lower = await save(admin, night.id, 1, { capacity: 1 });
    expect(lower.statusCode).toBe(422);
    expect(lower.json().error.fieldErrors.capacity).toMatch(
      /already has 2 bookings/,
    );
    const mode = await save(admin, night.id, 1, {
      joinMode: 'none',
      capacity: null,
    });
    expect(mode.statusCode).toBe(422);
    expect(mode.json().error.fieldErrors.joinMode).toMatch(/2 people/);
    const moved = await save(admin, night.id, 1, {
      schedule: { ...base.schedule, days: [6] },
    });
    expect(moved.statusCode).toBe(422);
    expect(moved.json().error.fieldErrors['schedule.date']).toMatch(
      /2 bookings and would no longer be on the schedule/,
    );
    const ended = await save(admin, night.id, 1, {
      schedule: { ...base.schedule, until: addDays(sunday, -1) },
    });
    expect(ended.statusCode).toBe(422);
    expect(ended.json().error.fieldErrors['schedule.until']).toBeTruthy();
    // Nothing above was saved; a capacity equal to the bookings is fine.
    const fits = await save(admin, night.id, 1, { capacity: 2 });
    expect(fits.statusCode).toBe(200);
    expect(await active(night.id)).toBe(2);

    // Cancelling that one date keeps its bookings (shown as cancelled)…
    const url = `/v1/staff/activities/${night.id}/exceptions/${sunday}`;
    expect(
      (
        await call(
          'PUT',
          url,
          admin,
          {
            kind: 'cancelled',
            note: '',
            startTime: '',
            endTime: '',
            venue: '',
          },
          2,
        )
      ).statusCode,
    ).toBe(200);
    expect(await active(night.id)).toBe(2);
    const [plan] = (await call('GET', '/v1/member/participations', anna)).json()
      .data;
    expect(plan).toMatchObject({ date: sunday, dateCancelled: true });
    // …and putting it back restores them.
    expect((await call('DELETE', url, admin, undefined, 3)).statusCode).toBe(
      200,
    );
    expect(
      (await call('GET', '/v1/member/participations', anna)).json().data[0]
        .dateCancelled,
    ).toBe(false);

    // Archiving is allowed (people can still cancel); deleting is not.
    expect(
      (await save(admin, night.id, 4, { capacity: 2, status: 'archived' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await call('GET', '/v1/member/participations', anna)).json().data[0],
    ).toMatchObject({ available: false });
    const gone = await call(
      'DELETE',
      `/v1/staff/activities/${night.id}`,
      admin,
      undefined,
      5,
    );
    expect(gone.statusCode).toBe(409);
    expect(gone.json().error.code).toBe('HAS_HISTORY');
  });

  it('public counts never name anyone; the roster is staff-only', async () => {
    const admin = await as('ADMIN');
    const [anna, ben] = [await as('MEMBER'), await as('MEMBER')];
    const night = await create(admin);
    const hidden = await create(admin, { title: 'Hidden' });
    const first = (await book(anna, night.id)).json().data;
    await book(ben, night.id);
    await book(anna, hidden.id);
    await save(admin, hidden.id, 1, { status: 'archived' });

    const counts = await call('GET', '/v1/public/availability');
    expect(counts.statusCode).toBe(200);
    expect(counts.headers['cache-control']).toBe('no-store');
    expect(counts.json().data).toEqual({ [night.id]: { [sunday]: 2 } });
    const text = counts.body;
    for (const who of [anna, ben]) {
      expect(text).not.toContain(who.user.id);
      expect(text).not.toContain(who.user.email);
    }

    const roster = `/v1/staff/activities/${night.id}/roster`;
    expect((await call('GET', roster)).statusCode).toBe(401);
    expect((await call('GET', roster, anna)).statusCode).toBe(403);
    expect(
      (await call('DELETE', `/v1/staff/participations/${first.id}`, anna))
        .statusCode,
    ).toBe(403);
    const list = (await call('GET', roster, admin)).json().data;
    expect(list.map((item: { email: string }) => item.email).sort()).toEqual(
      [anna.user.email, ben.user.email].sort(),
    );

    // Staff remove Anna: her place is freed and the history says who.
    expect(
      (await call('DELETE', `/v1/staff/participations/${first.id}`, admin))
        .statusCode,
    ).toBe(204);
    expect(
      (await call('GET', '/v1/member/participations', anna)).json().data,
    ).toEqual([
      expect.objectContaining({ activityId: hidden.id, available: false }),
    ]);
    const after = (await call('GET', roster, admin)).json().data as {
      email: string;
      status: string;
    }[];
    expect(after.find((item) => item.email === anna.user.email)?.status).toBe(
      'cancelled',
    );
    expect(
      await prisma.participationEvent.findFirst({
        where: { participationId: first.id, action: 'removed' },
      }),
    ).toMatchObject({ actorId: admin.user.id });
  });
});
