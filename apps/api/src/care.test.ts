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
import { expirePrayers } from './lib/care-retention.js';

/*
 * Phase 4A: prayer requests are private server records. A member sees only
 * their own, the Pastor sees all with private notes, Admin gets nothing
 * (403 everywhere, no counts). Submitting is retry-safe; status changes are
 * versioned, forward-only and audited without text; notifications are
 * generic, once per transition, owner-scoped; closed requests expire after
 * 12 months with their notes, history and notifications.
 */

const SECRET_TEXT = 'Please pray for my brother’s surgery on Friday';
const NOTE_TEXT = 'Called him; follow up next week';

describe.skipIf(!dbTestsEnabled)('prayer requests (PostgreSQL)', () => {
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
  const submit = (who: Who, clientKey = 'draft-key-0001', text = SECRET_TEXT) =>
    call('POST', '/v1/member/prayers', who, { text, clientKey });
  const setStatus = (who: Who, id: string, status: string, version: number) =>
    call('POST', `/v1/pastor/prayers/${id}/status`, who, { status }, version);
  const notificationsOf = async (who: Who) =>
    (await call('GET', '/v1/me/notifications', who)).json().data as {
      items: {
        id: string;
        title: string;
        body: string;
        href: string;
        read: boolean;
      }[];
      unread: number;
    };

  it('a member sees only their own; a retry never sends twice', async () => {
    const [anna, ben] = [await as('MEMBER'), await as('MEMBER')];
    const pastor = await as('PASTOR');
    const first = await submit(anna);
    expect(first.statusCode).toBe(201);
    const prayer = first.json().data;
    expect(prayer).toMatchObject({
      text: SECRET_TEXT,
      status: 'submitted',
      closedAt: '',
      deleteAfter: '',
      history: [{ status: 'submitted' }],
    });
    expect(prayer).not.toHaveProperty('notes');

    // The same draft sent again (a retry, or two at once): one request.
    const [again, together] = await Promise.all([submit(anna), submit(anna)]);
    expect([again.statusCode, together.statusCode]).toEqual([200, 200]);
    expect(again.json().data.id).toBe(prayer.id);
    expect(await prisma.prayerRequest.count()).toBe(1);
    // Two first sends of a new draft at the same moment: still one.
    const [x, y] = await Promise.all([
      submit(anna, 'draft-key-race'),
      submit(anna, 'draft-key-race'),
    ]);
    expect([x.statusCode, y.statusCode].sort()).toEqual([200, 201]);
    expect(x.json().data.id).toBe(y.json().data.id);
    expect(await prisma.prayerRequest.count()).toBe(2);

    // The same key with different words is refused, not passed off as the
    // earlier request; so is a simultaneous pair with different words.
    const changed = await submit(anna, 'draft-key-0001', 'Different words');
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    const [p, q] = await Promise.all([
      submit(anna, 'draft-key-pair', 'First wording'),
      submit(anna, 'draft-key-pair', 'Second wording'),
    ]);
    expect([p.statusCode, q.statusCode].sort()).toEqual([201, 409]);
    expect(await prisma.prayerRequest.count()).toBe(3);
    // …and the Pastor heard about each request once.
    expect((await notificationsOf(pastor)).items).toHaveLength(3);

    expect((await call('GET', '/v1/member/prayers', ben)).json().data).toEqual(
      [],
    );
    expect(
      (await call('GET', `/v1/member/prayers/${prayer.id}`, ben)).statusCode,
    ).toBe(404);
    expect(
      (await call('GET', `/v1/member/prayers/${prayer.id}`, anna)).statusCode,
    ).toBe(200);
    expect((await call('GET', '/v1/member/prayers')).statusCode).toBe(401);
    // An empty request is refused with the field named.
    const empty = await submit(anna, 'draft-key-0002', '   ');
    expect(empty.statusCode).toBe(422);
    expect(empty.json().error.fieldErrors.text).toBeTruthy();
  });

  it('Admin and members get nothing from the Pastor’s routes', async () => {
    const anna = await as('MEMBER');
    const admin = await as('ADMIN');
    const id = (await submit(anna)).json().data.id;
    for (const who of [admin, anna]) {
      expect((await call('GET', '/v1/pastor/prayers', who)).statusCode).toBe(
        403,
      );
      expect(
        (await call('GET', '/v1/pastor/prayers?status=submitted', who))
          .statusCode,
      ).toBe(403);
      expect(
        (await call('GET', `/v1/pastor/prayers/${id}`, who)).statusCode,
      ).toBe(403);
      expect((await setStatus(who, id, 'praying', 1)).statusCode).toBe(403);
      expect(
        (
          await call(
            'POST',
            `/v1/pastor/prayers/${id}/notes`,
            who,
            { text: 'x' },
            1,
          )
        ).statusCode,
      ).toBe(403);
    }
    // Admin's own prayer list is just Admin's own (none), and no
    // notification about anyone's prayer reaches Admin.
    expect(
      (await call('GET', '/v1/member/prayers', admin)).json().data,
    ).toEqual([]);
    expect((await notificationsOf(admin)).items).toEqual([]);
    expect(
      (await prisma.prayerRequest.findUnique({ where: { id } }))?.status,
    ).toBe('SUBMITTED');
  });

  it('the Pastor moves a request forward with the version it loaded', async () => {
    const anna = await as('MEMBER');
    const pastor = await as('PASTOR');
    const id = (await submit(anna)).json().data.id;

    const list = (await call('GET', '/v1/pastor/prayers', pastor)).json().data;
    expect(list).toEqual([
      expect.objectContaining({
        id,
        text: SECRET_TEXT,
        version: 1,
        member: expect.objectContaining({ email: anna.user.email }),
      }),
    ]);
    expect(
      (
        await call('POST', `/v1/pastor/prayers/${id}/status`, pastor, {
          status: 'praying',
        })
      ).statusCode,
    ).toBe(428);

    // Two clicks at once with the same version: exactly one wins.
    const [a, b] = await Promise.all([
      setStatus(pastor, id, 'praying', 1),
      setStatus(pastor, id, 'praying', 1),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 412]);
    expect((await setStatus(pastor, id, 'prayed_for', 1)).statusCode).toBe(412);
    const closed = await setStatus(pastor, id, 'prayed_for', 2);
    expect(closed.statusCode).toBe(200);
    expect(closed.json().data).toMatchObject({
      status: 'prayed_for',
      version: 3,
    });
    // Forward only: no going back, no repeating.
    const back = await setStatus(pastor, id, 'praying', 3);
    expect(back.statusCode).toBe(409);
    expect(back.json().error.code).toBe('INVALID_TRANSITION');

    const mine = (await call('GET', `/v1/member/prayers/${id}`, anna)).json()
      .data;
    expect(
      mine.history.map((entry: { status: string }) => entry.status),
    ).toEqual(['submitted', 'praying', 'prayed_for']);
    expect(mine.closedAt).toBeTruthy();
    const deleteAfter = new Date(mine.closedAt);
    deleteAfter.setUTCMonth(deleteAfter.getUTCMonth() + 12);
    expect(mine.deleteAfter).toBe(deleteAfter.toISOString());
  });

  it('private notes stay with the Pastor; audits never hold the words', async () => {
    const anna = await as('MEMBER');
    const pastor = await as('PASTOR');
    const id = (await submit(anna)).json().data.id;
    const noted = await call(
      'POST',
      `/v1/pastor/prayers/${id}/notes`,
      pastor,
      { text: NOTE_TEXT },
      1,
    );
    expect(noted.statusCode).toBe(201);
    expect(noted.json().data).toMatchObject({
      version: 2,
      noteCount: 1,
      notes: [expect.objectContaining({ text: NOTE_TEXT })],
    });
    expect(
      (
        await call(
          'POST',
          `/v1/pastor/prayers/${id}/notes`,
          pastor,
          { text: 'late' },
          1,
        )
      ).statusCode,
    ).toBe(412);
    await setStatus(pastor, id, 'praying', 2);

    const memberView = JSON.stringify(
      (await call('GET', '/v1/member/prayers', anna)).json(),
    );
    expect(memberView).not.toContain(NOTE_TEXT);
    const audits = JSON.stringify(
      await prisma.auditEvent.findMany({ where: { entityType: 'prayer' } }),
    );
    expect(audits).toContain('care.prayer_submitted');
    expect(audits).toContain('care.prayer_note_added');
    expect(audits).toContain('care.prayer_status_changed');
    expect(audits).not.toContain(SECRET_TEXT);
    expect(audits).not.toContain(NOTE_TEXT);
  });

  it('notifications: generic, once per transition, owner-scoped read state', async () => {
    const anna = await as('MEMBER');
    const ben = await as('MEMBER');
    const pastor = await as('PASTOR');
    const id = (await submit(anna)).json().data.id;
    const toPastor = await notificationsOf(pastor);
    expect(toPastor).toMatchObject({ unread: 1 });
    expect(toPastor.items[0]).toMatchObject({
      title: 'New prayer request',
      href: `/pastor/care?prayer=${id}`,
      read: false,
    });

    await setStatus(pastor, id, 'praying', 1);
    await setStatus(pastor, id, 'prayed_for', 2);
    const toAnna = await notificationsOf(anna);
    expect(toAnna.unread).toBe(2);
    expect(toAnna.items.map((item) => item.body)).toEqual([
      'The pastor has prayed for your request.',
      'The pastor is praying for your request.',
    ]);
    expect(
      toAnna.items.every(
        (item) => item.href === `/members/prayer?request=${id}`,
      ),
    ).toBe(true);
    // No prayer words in any notification, for anyone.
    expect(JSON.stringify(await prisma.notification.findMany())).not.toContain(
      SECRET_TEXT,
    );
    expect((await notificationsOf(ben)).items).toEqual([]);

    // Read state is per person and persisted; others' are not found.
    const [latest] = toAnna.items;
    expect(
      (await call('POST', `/v1/me/notifications/${latest!.id}/read`, ben))
        .statusCode,
    ).toBe(404);
    const read = await call(
      'POST',
      `/v1/me/notifications/${latest!.id}/read`,
      anna,
    );
    expect(read.json().data.unread).toBe(1);
    expect(
      (
        await call('POST', `/v1/me/notifications/${latest!.id}/read`, anna)
      ).json().data.unread,
    ).toBe(1);
    expect(
      (await call('POST', '/v1/me/notifications/read-all', anna)).json().data
        .unread,
    ).toBe(0);
    expect((await notificationsOf(pastor)).unread).toBe(1);
    expect((await call('GET', '/v1/me/notifications')).statusCode).toBe(401);
  });

  it('closed requests expire after 12 months with their notes, history and notifications', async () => {
    const anna = await as('MEMBER');
    const pastor = await as('PASTOR');
    const make = async (key: string) => {
      const id = (await submit(anna, key)).json().data.id as string;
      await call(
        'POST',
        `/v1/pastor/prayers/${id}/notes`,
        pastor,
        { text: NOTE_TEXT },
        1,
      );
      return id;
    };
    const old = await make('draft-key-old1');
    const recent = await make('draft-key-new1');
    const open = await make('draft-key-open');
    for (const id of [old, recent]) {
      await setStatus(pastor, id, 'praying', 2);
      await setStatus(pastor, id, 'prayed_for', 3);
    }
    const now = new Date('2028-06-15T00:00:00Z');
    const monthsAgo = (months: number) => {
      const date = new Date(now);
      date.setUTCMonth(date.getUTCMonth() - months);
      return date;
    };
    await prisma.prayerRequest.update({
      where: { id: old },
      data: { closedAt: monthsAgo(13) },
    });
    await prisma.prayerRequest.update({
      where: { id: recent },
      data: { closedAt: monthsAgo(11) },
    });
    // Open for years: never age-deleted.
    await prisma.prayerRequest.update({
      where: { id: open },
      data: { createdAt: monthsAgo(36) },
    });

    expect(await expirePrayers(now)).toBe(1);
    expect(await expirePrayers(now)).toBe(0);
    const left = await prisma.prayerRequest.findMany({ select: { id: true } });
    expect(left.map((row) => row.id).sort()).toEqual([open, recent].sort());
    expect(await prisma.prayerNote.count({ where: { prayerId: old } })).toBe(0);
    expect(await prisma.prayerEvent.count({ where: { prayerId: old } })).toBe(
      0,
    );
    expect(await prisma.notification.count({ where: { entityId: old } })).toBe(
      0,
    );
    expect(
      await prisma.notification.count({ where: { entityId: recent } }),
    ).toBeGreaterThan(0);
    expect(
      (await call('GET', `/v1/member/prayers/${old}`, anna)).statusCode,
    ).toBe(404);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'care.prayers_expired' },
    });
    expect(audit?.metadata).toEqual({ count: 1 });
  });
});
