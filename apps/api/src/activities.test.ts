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
});
