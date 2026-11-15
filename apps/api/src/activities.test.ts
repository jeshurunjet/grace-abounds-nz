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
  defaultPages,
  defaultSiteSettings,
  pageKeys,
} from '@grace-abounds/validation';
import { buildApp } from './app.js';
import { publicActivities } from './routes/activities.js';
import { contentGeneration } from './lib/content-change.js';

/*
 * Phase 3A: activities are database records edited by staff with explicit,
 * versioned saves; members and the public see only published, live ones;
 * one date can be changed or cancelled without changing its identity.
 */

const activity = {
  kind: 'service',
  title: 'Sunday Service',
  summary: 'Worship and teaching.',
  leader: '',
  tag: 'Service',
  locationId: 'manukau',
  venue: '',
  image: '',
  schedule: {
    repeat: 'weekly',
    date: '2026-11-01',
    until: '',
    days: [0],
    monthWeek: 1,
    monthDay: 0,
    startTime: '10:00',
    endTime: '11:30',
  },
  joinMode: 'booking',
  capacity: 200,
  status: 'draft',
  publishAt: '',
};

describe.skipIf(!dbTestsEnabled)('activities (PostgreSQL)', () => {
  const app = buildApp();
  beforeAll(() => app.ready());
  beforeEach(async () => {
    await resetIdentityTables();
    await prisma.location.create({
      data: { key: 'manukau', name: 'Manukau', status: 'PUBLISHED' },
    });
  });
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
    version?: number,
    body?: unknown,
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
  const create = async (who: Who, over: object = {}) => {
    const response = await call(
      'POST',
      '/v1/staff/activities',
      who,
      undefined,
      {
        ...activity,
        ...over,
      },
    );
    expect(response.statusCode).toBe(201);
    return response.json().data as {
      id: string;
      version: number;
      slug: string;
    };
  };
  const publicIds = async () =>
    (await publicActivities()).activities.map((item) => item.id);
  const dateUrl = (id: string, date: string) =>
    `/v1/staff/activities/${id}/exceptions/${date}`;
  const changedDate = (times: { startTime?: string; endTime?: string }) => ({
    kind: 'changed',
    note: '',
    startTime: '',
    endTime: '',
    venue: '',
    ...times,
  });

  it('only staff list and edit activities', async () => {
    const member = await as('MEMBER');
    expect((await call('GET', '/v1/staff/activities')).statusCode).toBe(401);
    expect((await call('GET', '/v1/staff/activities', member)).statusCode).toBe(
      403,
    );
    expect(
      (await call('POST', '/v1/staff/activities', member, undefined, activity))
        .statusCode,
    ).toBe(403);
    expect(await prisma.activity.count()).toBe(0);
  });

  it('a draft stays private; publishing puts it on every calendar', async () => {
    const admin = await as('ADMIN');
    const before = await contentGeneration();
    const draft = await create(admin);
    expect(draft.slug).toBe('sunday-service');
    expect(await publicIds()).toEqual([]);
    expect(await contentGeneration()).toBeGreaterThan(before);

    const published = await call(
      'PATCH',
      `/v1/staff/activities/${draft.id}`,
      admin,
      1,
      { ...activity, status: 'published' },
    );
    expect(published.statusCode).toBe(200);
    expect(published.json().data).toMatchObject({
      status: 'published',
      version: 2,
      locationId: 'manukau',
      schedule: { repeat: 'weekly', days: [0], startTime: '10:00' },
    });
    expect(await publicIds()).toEqual([draft.id]);

    // Each save leaves a revision and an audit event.
    expect(
      await prisma.contentRevision.count({
        where: { entityType: 'activities', entityKey: draft.id },
      }),
    ).toBe(2);
    expect(
      await prisma.auditEvent.findMany({
        where: { entityId: draft.id },
        select: { action: true },
        orderBy: { createdAt: 'asc' },
      }),
    ).toEqual([
      { action: 'content.activity_created' },
      { action: 'content.activity_saved' },
    ]);
  });

  it('a stale or missing version is refused; nothing is overwritten', async () => {
    const admin = await as('ADMIN');
    const pastor = await as('PASTOR');
    const draft = await create(admin);
    await call('PATCH', `/v1/staff/activities/${draft.id}`, pastor, 1, {
      ...activity,
      title: 'Pastor’s title',
    });
    const stale = await call(
      'PATCH',
      `/v1/staff/activities/${draft.id}`,
      admin,
      1,
      {
        ...activity,
        title: 'Admin’s title',
      },
    );
    expect(stale.statusCode).toBe(412);
    const missing = await call(
      'PATCH',
      `/v1/staff/activities/${draft.id}`,
      admin,
      undefined,
      activity,
    );
    expect(missing.statusCode).toBe(428);
    expect(
      (await prisma.activity.findUnique({ where: { id: draft.id } }))!.title,
    ).toBe('Pastor’s title');
  });

  it('checks the campus, real dates and the daylight-saving hour', async () => {
    const admin = await as('ADMIN');
    const bad = async (over: object) =>
      (
        await call('POST', '/v1/staff/activities', admin, undefined, {
          ...activity,
          ...over,
        })
      ).json().error.fieldErrors;
    expect(await bad({ locationId: 'nowhere' })).toHaveProperty(['locationId']);
    expect(
      await bad({ schedule: { ...activity.schedule, startTime: '02:30' } }),
    ).toHaveProperty(['schedule.startTime']);
    expect(
      await bad({ schedule: { ...activity.schedule, date: '2026-02-30' } }),
    ).toHaveProperty(['schedule.date']);
    expect(await prisma.activity.count()).toBe(0);
  });

  it('a scheduled activity stays hidden until its release time', async () => {
    const admin = await as('ADMIN');
    const later = await create(admin, {
      status: 'published',
      publishAt: '2099-12-01T09:00',
    });
    const earlier = await create(admin, {
      title: 'Already live',
      status: 'published',
      publishAt: '2020-01-01T09:00',
    });
    expect(await publicIds()).toEqual([earlier.id]);
    const list = (await call('GET', '/v1/staff/activities', admin)).json().data
      .activities as { id: string; status: string; publishAt: string }[];
    expect(list.find((item) => item.id === later.id)).toMatchObject({
      status: 'scheduled',
      publishAt: '2099-12-01T09:00',
    });
    // Stored as the UTC instant of that NZ local time (NZDT, +13).
    expect(
      (await prisma.activity.findUnique({
        where: { id: later.id },
      }))!.publishAt!.toISOString(),
    ).toBe('2099-11-30T20:00:00.000Z');
  });

  it('changes or cancels one date; identity and the other dates stay', async () => {
    const admin = await as('ADMIN');
    const service = await create(admin, { status: 'published' });
    const url = (date: string) =>
      `/v1/staff/activities/${service.id}/exceptions/${date}`;

    // Not a date this activity has (a Monday): refused.
    const wrong = await call('PUT', url('2026-11-02'), admin, 1, {
      kind: 'cancelled',
      note: '',
      startTime: '',
      endTime: '',
      venue: '',
    });
    expect(wrong.statusCode).toBe(422);

    const cancelled = await call('PUT', url('2026-12-27'), admin, 1, {
      kind: 'cancelled',
      note: 'Combined service at Manukau.',
      startTime: '',
      endTime: '',
      venue: '',
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data.version).toBe(2);
    // A stale editor can't change dates either.
    const stale = await call('PUT', url('2027-01-03'), admin, 1, {
      kind: 'cancelled',
      note: '',
      startTime: '',
      endTime: '',
      venue: '',
    });
    expect(stale.statusCode).toBe(412);

    const badTime = await call('PUT', url('2027-01-03'), admin, 2, {
      kind: 'changed',
      note: '',
      startTime: '12:00',
      endTime: '',
      venue: '',
    });
    expect(badTime.statusCode).toBe(422); // ends 11:30, before 12:00

    const changed = await call('PUT', url('2027-01-03'), admin, 2, {
      kind: 'changed',
      note: 'Summer time',
      startTime: '09:00',
      endTime: '10:30',
      venue: 'Main Auditorium',
    });
    expect(changed.statusCode).toBe(200);
    const { activityExceptions } = await publicActivities();
    expect(
      activityExceptions.map(({ date, kind, startTime }) => ({
        date,
        kind,
        startTime,
      })),
    ).toEqual([
      { date: '2026-12-27', kind: 'cancelled', startTime: '' },
      { date: '2027-01-03', kind: 'changed', startTime: '09:00' },
    ]);

    // Back to the usual schedule; doing it twice says so.
    expect((await call('DELETE', url('2026-12-27'), admin, 3)).statusCode).toBe(
      200,
    );
    const again = await call('DELETE', url('2026-12-27'), admin, 4);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('NOTHING_TO_RESTORE');
    expect(
      await prisma.auditEvent.count({
        where: {
          entityId: service.id,
          action: {
            in: [
              'content.activity_date_cancelled',
              'content.activity_date_changed',
              'content.activity_date_restored',
            ],
          },
        },
      }),
    ).toBe(3);
  });

  it('published activities are archived before they can be deleted', async () => {
    const admin = await as('ADMIN');
    const service = await create(admin, { status: 'published' });
    await call(
      'PUT',
      `/v1/staff/activities/${service.id}/exceptions/2026-12-27`,
      admin,
      1,
      { kind: 'cancelled', note: '', startTime: '', endTime: '', venue: '' },
    );
    const refused = await call(
      'DELETE',
      `/v1/staff/activities/${service.id}`,
      admin,
      2,
    );
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('ARCHIVE_FIRST');
    await call('PATCH', `/v1/staff/activities/${service.id}`, admin, 2, {
      ...activity,
      status: 'archived',
    });
    expect(await publicIds()).toEqual([]);
    expect(
      (await call('DELETE', `/v1/staff/activities/${service.id}`, admin, 3))
        .statusCode,
    ).toBe(204);
    expect(await prisma.activityException.count()).toBe(0);
  });

  it('restoring an older version keeps today’s visibility', async () => {
    const admin = await as('ADMIN');
    const draft = await create(admin, { title: 'First title' });
    await call('PATCH', `/v1/staff/activities/${draft.id}`, admin, 1, {
      ...activity,
      title: 'Second title',
      status: 'published',
    });
    const history = (
      await call(
        'GET',
        `/v1/staff/revisions?entityType=activities&entityKey=${draft.id}`,
        admin,
      )
    ).json().data as { id: string; version: number }[];
    const first = history.find((item) => item.version === 1)!;
    const restored = await call(
      'POST',
      `/v1/staff/revisions/${first.id}/restore`,
      admin,
      2,
    );
    expect(restored.statusCode).toBe(200);
    const row = (await prisma.activity.findUnique({
      where: { id: draft.id },
    }))!;
    expect(row).toMatchObject({
      title: 'First title',
      status: 'PUBLISHED',
      version: 3,
    });
  });

  it('a release time passing reaches open pages with no save', async () => {
    // The clock: 08:00 NZDT on 1 Dec 2099, an hour before the release.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2099-11-30T19:00:00Z'));
      await prisma.siteSettings.create({
        data: { id: 'site', data: defaultSiteSettings },
      });
      for (const key of pageKeys)
        await prisma.pageContent.create({
          data: { key, data: defaultPages[key] },
        });
      const admin = await as('ADMIN');
      const live = await create(admin, {
        title: 'Live now',
        status: 'published',
      });
      const release = await create(admin, {
        title: 'Christmas launch',
        status: 'published',
        publishAt: '2099-12-01T09:00',
      });
      const later = await create(admin, {
        title: 'Later launch',
        status: 'published',
        publishAt: '2099-12-01T12:00',
      });
      const draft = await create(admin, { title: 'Still a draft' });
      type Bundle = {
        generation: number;
        released: number;
        collections: { activities: { id: string }[] };
      };
      const bundle = async () =>
        (await call('GET', '/v1/public/content')).json().data as Bundle;
      const stamp = async () =>
        (await call('GET', '/v1/public/content/stamp')).json().data as {
          generation: number;
          released: number;
        };
      const ids = (data: Bundle) =>
        data.collections.activities.map((item) => item.id).sort();

      const before = await bundle();
      expect(ids(before)).toEqual([live.id]);
      expect(before.released).toBe(0);
      expect(await stamp()).toEqual({
        generation: before.generation,
        released: 0,
      });

      // 09:30 NZDT: the release has passed and nobody has saved anything.
      vi.setSystemTime(new Date('2099-11-30T20:30:00Z'));
      const latest = await stamp();
      expect(latest.generation).toBe(before.generation);
      expect(latest.released).toBe(Date.parse('2099-11-30T20:00:00Z'));
      expect(latest.released).toBeGreaterThan(before.released);
      // The page refreshes and now shows the released activity.
      const after = await bundle();
      expect(ids(after)).toEqual([live.id, release.id].sort());
      expect(after.released).toBe(latest.released);
      // Drafts and later releases stay private, and nothing says when.
      const text = JSON.stringify(after) + JSON.stringify(latest);
      expect(text).not.toContain(later.id);
      expect(text).not.toContain(draft.id);
      expect(text).not.toContain('2099-11-30T23:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('new series times must keep every changed date valid', async () => {
    const admin = await as('ADMIN');
    const morning = {
      ...activity.schedule,
      startTime: '09:00',
      endTime: '12:00',
    };
    const service = await create(admin, {
      status: 'published',
      schedule: morning,
    });
    // 27 Dec has its own end time; 3 Jan has its own start time.
    expect(
      (
        await call(
          'PUT',
          dateUrl(service.id, '2026-12-27'),
          admin,
          1,
          changedDate({ endTime: '10:00' }),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'PUT',
          dateUrl(service.id, '2027-01-03'),
          admin,
          2,
          changedDate({ startTime: '08:00' }),
        )
      ).statusCode,
    ).toBe(200);
    const save = (startTime: string, endTime: string, version: number) =>
      call('PATCH', `/v1/staff/activities/${service.id}`, admin, version, {
        ...activity,
        status: 'published',
        schedule: { ...morning, startTime, endTime },
      });

    // 11:00 would make 27 Dec run 11:00–10:00: refused, naming the date.
    const late = await save('11:00', '12:00', 3);
    expect(late.statusCode).toBe(422);
    expect(late.json().error.fieldErrors['schedule.startTime']).toMatch(
      /27 Dec 2026/,
    );
    // 07:30 would make 3 Jan run 08:00–07:30: refused the same way.
    const early = await save('06:00', '07:30', 3);
    expect(early.statusCode).toBe(422);
    expect(early.json().error.fieldErrors['schedule.endTime']).toMatch(
      /3 Jan 2027/,
    );
    // Nothing was saved or discarded.
    expect(
      await prisma.activity.findUnique({ where: { id: service.id } }),
    ).toMatchObject({ startTime: '09:00', endTime: '12:00', version: 3 });
    expect(
      await prisma.activityException.count({
        where: { activityId: service.id },
      }),
    ).toBe(2);

    // Times that suit both changed dates save; both dates are kept.
    const fine = await save('09:30', '12:00', 3);
    expect(fine.statusCode).toBe(200);
    expect(fine.json().version).toBe(4);
    expect(
      await prisma.activityException.count({
        where: { activityId: service.id },
      }),
    ).toBe(2);
  });

  it('restoring older times is refused while a changed date depends on them', async () => {
    const admin = await as('ADMIN');
    const late = { ...activity.schedule, startTime: '11:00', endTime: '12:00' };
    const service = await create(admin, {
      status: 'published',
      schedule: late,
    });
    await call('PATCH', `/v1/staff/activities/${service.id}`, admin, 1, {
      ...activity,
      status: 'published',
      schedule: { ...late, startTime: '09:00' },
    });
    expect(
      (
        await call(
          'PUT',
          dateUrl(service.id, '2026-12-27'),
          admin,
          2,
          changedDate({ endTime: '10:00' }),
        )
      ).statusCode,
    ).toBe(200);
    const history = (
      await call(
        'GET',
        `/v1/staff/revisions?entityType=activities&entityKey=${service.id}`,
        admin,
      )
    ).json().data as { id: string; version: number }[];
    const restore = (version: number) =>
      call(
        'POST',
        `/v1/staff/revisions/${history.find((item) => item.version === version)!.id}/restore`,
        admin,
        3,
      );

    // Version 1 started at 11:00, after 27 Dec's own 10:00 end.
    const refused = await restore(1);
    expect(refused.statusCode).toBe(422);
    expect(refused.json().error.message).toMatch(/27 Dec 2026/);
    expect(
      await prisma.activity.findUnique({ where: { id: service.id } }),
    ).toMatchObject({ startTime: '09:00', version: 3 });
    expect(
      await prisma.activityException.count({
        where: { activityId: service.id },
      }),
    ).toBe(1);

    // Version 2 has the same times as now: restored as version 4.
    const restored = await restore(2);
    expect(restored.statusCode).toBe(200);
    expect(
      await prisma.activity.findUnique({ where: { id: service.id } }),
    ).toMatchObject({ startTime: '09:00', version: 4 });
  });
});
