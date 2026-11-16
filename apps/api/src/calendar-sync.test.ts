// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { SignJWT } from 'jose';
import { prisma } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';
import {
  addDays,
  nextSunday,
  nzNow,
  scheduleDates,
} from '@grace-abounds/validation';
import { buildApp } from './app.js';
import { drainOutbox } from './lib/outbox.js';
import { CONTENT_CHANGED } from './lib/content-change.js';
import {
  CALENDAR_SYNC,
  DAYS_AHEAD,
  calendarSweep,
  calendarSyncPass,
  calendarSyncRequester,
} from './lib/calendar-sync.js';
import {
  CalendarError,
  MemoryCalendar,
  googleEventId,
  type CalendarProvider,
} from './lib/google-calendar.js';

/*
 * Phase 3C: one-way public Google Calendar sync, against an in-memory
 * calendar. Saves never wait for Google; each upcoming date is one event
 * with a stable id; changes update in place; cancelled dates and
 * unpublished activities leave Google; past events stay; outages lose and
 * duplicate nothing; scheduled releases arrive with no save; only public
 * fields leave the app.
 */

const sunday = addDays(nextSunday(nzNow().date), 7);
const base = {
  kind: 'event',
  title: 'Family Night',
  summary: 'Games and food for all ages.',
  leader: 'Sarah Keil',
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
  capacity: 40,
  status: 'published',
  publishAt: '',
};
const upcoming = () => {
  const today = nzNow().date;
  return scheduleDates(
    base.schedule as never,
    today,
    addDays(today, DAYS_AHEAD),
  );
};

describe.skipIf(!dbTestsEnabled)('Google Calendar sync (PostgreSQL)', () => {
  const app = buildApp();
  let google: MemoryCalendar;
  beforeAll(async () => {
    // A known public address, so the link back can be checked exactly.
    process.env.NEXT_PUBLIC_SITE_URL = 'https://church.example';
    await app.ready();
  });
  beforeEach(async () => {
    await resetIdentityTables();
    google = new MemoryCalendar();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function as(role: 'MEMBER' | 'ADMIN') {
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
    return response.json().data as {
      id: string;
      slug: string;
      version: number;
    };
  };
  const save = (admin: Who, id: string, version: number, over: object) =>
    call(
      'PATCH',
      `/v1/staff/activities/${id}`,
      admin,
      { ...base, ...over },
      version,
    );
  const dateUrl = (id: string, date: string) =>
    `/v1/staff/activities/${id}/exceptions/${date}`;
  /** The outbox runs, then the worker until nothing is due. */
  async function deliver(provider: CalendarProvider = google) {
    // Everything queued so far is due now, whatever the database's clock
    // says (it can trail the app's clock by a moment).
    await prisma.outboxEvent.updateMany({
      where: { processedAt: null },
      data: { availableAt: new Date(0) },
    });
    await drainOutbox({
      [CONTENT_CHANGED]: async () => {},
      [CALENDAR_SYNC]: calendarSyncRequester(),
    });
    for (let pass = 0; pass < 20 && (await calendarSyncPass(provider)); pass++);
  }
  const state = (activityId: string) =>
    prisma.calendarSync.findUnique({ where: { activityId } });

  it('publishing sends each upcoming date once; edits update in place', async () => {
    const admin = await as('ADMIN');
    const member = await as('MEMBER');
    const night = await create(admin);
    await call('POST', '/v1/member/participations', member, {
      activityId: night.id,
      date: sunday,
    });
    await deliver();

    const dates = upcoming();
    expect(google.events.size).toBe(dates.length);
    expect([...google.events.keys()].sort()).toEqual(
      dates.map((date) => googleEventId(night.id, date)).sort(),
    );
    expect((await state(night.id))?.status).toBe('synced');
    expect(google.events.get(googleEventId(night.id, sunday))).toEqual({
      summary: 'Family Night',
      description:
        'Games and food for all ages.\n\nDetails: https://church.example/events/family-night',
      location: 'Main hall',
      start: { dateTime: `${sunday}T18:00:00`, timeZone: 'Pacific/Auckland' },
      end: { dateTime: `${sunday}T20:00:00`, timeZone: 'Pacific/Auckland' },
    });
    // Only public event fields; nothing about people or places taken.
    for (const item of google.events.values())
      expect(Object.keys(item).sort()).toEqual([
        'description',
        'end',
        'location',
        'start',
        'summary',
      ]);
    const sent = JSON.stringify([...google.events.values()]);
    for (const secret of [member.user.email, member.user.id, 'Sarah Keil'])
      expect(sent).not.toContain(secret);

    // Nothing changed: nothing is sent again.
    const calls = google.calls.length;
    await deliver();
    expect(google.calls.length).toBe(calls);

    // A new title updates every event; none is duplicated.
    expect(
      (await save(admin, night.id, 1, { title: 'Family Night Out' }))
        .statusCode,
    ).toBe(200);
    await deliver();
    expect(google.events.size).toBe(dates.length);
    expect(google.created).toBe(dates.length);
    expect(
      [...google.events.values()].every(
        (item) => item.summary === 'Family Night Out',
      ),
    ).toBe(true);
  });

  it('a cancelled date leaves Google and comes back; a changed date updates', async () => {
    const admin = await as('ADMIN');
    const night = await create(admin);
    await deliver();
    const id = googleEventId(night.id, sunday);
    const cancel = {
      kind: 'cancelled',
      note: 'Hall closed',
      startTime: '',
      endTime: '',
      venue: '',
    };
    expect(
      (await call('PUT', dateUrl(night.id, sunday), admin, cancel, 1))
        .statusCode,
    ).toBe(200);
    await deliver();
    expect(google.events.has(id)).toBe(false);
    expect(
      (await call('DELETE', dateUrl(night.id, sunday), admin, undefined, 2))
        .statusCode,
    ).toBe(200);
    await deliver();
    expect(google.events.has(id)).toBe(true);

    const later = addDays(sunday, 7);
    await call(
      'PUT',
      dateUrl(night.id, later),
      admin,
      {
        kind: 'changed',
        note: 'Later start',
        startTime: '19:00',
        endTime: '21:00',
        venue: 'Hall B',
      },
      3,
    );
    await deliver();
    expect(google.events.get(googleEventId(night.id, later))).toMatchObject({
      start: { dateTime: `${later}T19:00:00` },
      end: { dateTime: `${later}T21:00:00` },
      location: 'Hall B',
      description:
        'Games and food for all ages.\n\nLater start\n\nDetails: https://church.example/events/family-night',
    });
  });

  it('Google being down loses nothing and duplicates nothing', async () => {
    const admin = await as('ADMIN');
    const member = await as('MEMBER');
    // Fails on the third call, after two events were confirmed.
    let count = 0;
    const flaky: CalendarProvider = {
      upsert: async (id, event) => {
        if (++count === 3)
          throw new CalendarError(
            'Google Calendar create failed (503).',
            503,
            true,
          );
        return google.upsert(id, event);
      },
      remove: (id) => google.remove(id),
    };
    const night = await create(admin);
    await deliver(flaky);
    // The activity is saved regardless.
    expect(
      await prisma.activity.findUnique({ where: { id: night.id } }),
    ).toMatchObject({ status: 'PUBLISHED' });
    const failed = await state(night.id);
    expect(failed).toMatchObject({ status: 'failed', attempts: 1 });
    expect(failed!.lastError).toMatch(/503/);
    expect(failed!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(google.events.size).toBe(2);

    // Members can't retry; staff can, and it finishes without duplicates.
    expect(
      (await call('POST', `/v1/staff/calendar-sync/${night.id}/retry`, member))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `/v1/staff/calendar-sync/${night.id}/retry`, admin))
        .statusCode,
    ).toBe(200);
    await deliver();
    expect((await state(night.id))?.status).toBe('synced');
    expect(google.events.size).toBe(upcoming().length);
    expect(google.created).toBe(upcoming().length);
  });

  it('unpublishing or deleting removes upcoming events, never past ones', async () => {
    const admin = await as('ADMIN');
    const night = await create(admin);
    await deliver();
    // A past event Google already has.
    const past = { id: 'gapast00001', h: 'old' };
    google.events.set(past.id, { ...[...google.events.values()][0]! });
    const record = (await state(night.id))!;
    await prisma.calendarSync.update({
      where: { activityId: night.id },
      data: {
        synced: { ...(record.synced as object), '2020-01-05': past },
      },
    });

    // Archived while Google is down, then deleted: removal still happens.
    google.failures = 100;
    expect(
      (await save(admin, night.id, 1, { status: 'archived' })).statusCode,
    ).toBe(200);
    await deliver();
    expect((await state(night.id))?.status).toBe('failed');
    expect(
      (
        await call(
          'DELETE',
          `/v1/staff/activities/${night.id}`,
          admin,
          undefined,
          2,
        )
      ).statusCode,
    ).toBe(204);
    google.failures = 0;
    await call('POST', `/v1/staff/calendar-sync/${night.id}/retry`, admin);
    await deliver();
    expect([...google.events.keys()]).toEqual([past.id]);
    expect(google.calls.some((item) => item.includes(past.id))).toBe(false);
  });

  it('a scheduled release reaches Google with no save', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2099-11-30T19:00:00Z')); // 08:00 NZDT
      const admin = await as('ADMIN');
      const launch = await create(admin, {
        title: 'Christmas launch',
        publishAt: '2099-12-01T09:00',
        schedule: {
          ...base.schedule,
          repeat: 'once',
          date: '2099-12-05',
          days: [],
        },
      });
      await deliver();
      expect(google.events.size).toBe(0);
      vi.setSystemTime(new Date('2099-11-30T20:30:00Z')); // after release
      await deliver();
      expect(google.events.size).toBe(0); // no save happened…
      expect(await calendarSweep()).toBe(1); // …the sweep notices
      await deliver();
      expect([...google.events.keys()]).toEqual([
        googleEventId(launch.id, '2099-12-05'),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('staff see the state; .ics exports are public and complete', async () => {
    const admin = await as('ADMIN');
    const member = await as('MEMBER');
    const night = await create(admin);
    const later = addDays(sunday, 7);
    await call(
      'PUT',
      dateUrl(night.id, sunday),
      admin,
      { kind: 'cancelled', note: '', startTime: '', endTime: '', venue: '' },
      1,
    );
    await call(
      'PUT',
      dateUrl(night.id, later),
      admin,
      { kind: 'changed', note: '', startTime: '19:00', endTime: '', venue: '' },
      2,
    );
    await deliver();

    expect(
      (await call('GET', '/v1/staff/calendar-sync', member)).statusCode,
    ).toBe(403);
    const status = (await call('GET', '/v1/staff/calendar-sync', admin)).json()
      .data;
    expect(typeof status.configured).toBe('boolean');
    expect(status.items).toEqual([
      expect.objectContaining({ activityId: night.id, status: 'synced' }),
    ]);

    const url = `/v1/public/activities/${night.slug}/calendar.ics`;
    const series = await call('GET', url);
    expect(series.statusCode).toBe(200);
    expect(series.headers['content-type']).toMatch(/^text\/calendar/);
    const stamp = (date: string, time: string) =>
      `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
    expect(series.body).toContain('RRULE:FREQ=WEEKLY;BYDAY=SU');
    expect(series.body).toContain(
      `EXDATE;TZID=Pacific/Auckland:${stamp(sunday, '18:00')}`,
    );
    expect(series.body).toContain(
      `RECURRENCE-ID;TZID=Pacific/Auckland:${stamp(later, '18:00')}`,
    );
    expect(series.body).toContain(
      `DTSTART;TZID=Pacific/Auckland:${stamp(later, '19:00')}`,
    );
    expect(series.body).toContain('SEQUENCE:3');

    const single = await call('GET', `${url}?date=${sunday}`);
    expect(single.body).toContain('STATUS:CANCELLED');
    expect(
      (await call('GET', `${url}?date=${addDays(sunday, 1)}`)).statusCode,
    ).toBe(404);
    const draft = await create(admin, {
      title: 'Quiet draft',
      status: 'draft',
    });
    expect(
      (await call('GET', `/v1/public/activities/${draft.slug}/calendar.ics`))
        .statusCode,
    ).toBe(404);
  });
});
