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
import { addDays, nzNow } from '@grace-abounds/validation';
import { buildApp } from './app.js';
import { expireAppointments } from './lib/care-retention.js';

/*
 * Phase 4B: appointments are private server records. A member sees only
 * their own; the Pastor sees everything including the topic, message and
 * private notes; Admin schedules with logistics only (who, contact, time,
 * place, status) and never receives topics, messages, notes or note counts.
 * Suggested times reserve nothing; confirmed times are reserved and the
 * server refuses overlaps, even for simultaneous confirms. Writes are
 * versioned and audited without text; notifications are generic, once per
 * transition, with role-specific links; closed appointments expire 30 days
 * after closing (never while active or before their time has passed); no
 * appointment reaches the public calendar or Google.
 */

const REASON = 'My marriage is struggling and I need to talk';
const NOTE = 'Suggested couples counselling referral';

describe.skipIf(!dbTestsEnabled)('appointments (PostgreSQL)', () => {
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
  const ask = (
    who: Who,
    clientKey = 'appt-key-0001',
    details: Record<string, string> = {},
  ) =>
    call('POST', '/v1/member/appointments', who, {
      topic: 'Marriage and family',
      reason: REASON,
      preferredDate: '',
      preferredTime: 'morning',
      clientKey,
      ...details,
    });
  // A weekday a month ahead, well clear of daylight-saving changes.
  const day = addDays(nzNow().date, 30);
  const slot = (time = '10:00', minutes = 60, date = day) => ({
    date,
    time,
    minutes,
    location: 'Church office',
  });
  const staffDo = (
    who: Who,
    id: string,
    action: string,
    version: number,
    body: unknown = {},
  ) =>
    call('POST', `/v1/staff/appointments/${id}/${action}`, who, body, version);
  const memberDo = (who: Who, id: string, action: string, version: number) =>
    call('POST', `/v1/member/appointments/${id}/${action}`, who, {}, version);
  const notificationsOf = async (who: Who) =>
    (await call('GET', '/v1/me/notifications', who)).json().data.items as {
      title: string;
      body: string;
      href: string;
    }[];

  it('members see only their own; a retry never asks twice', async () => {
    const [anna, ben] = [await as('MEMBER'), await as('MEMBER')];
    const pastor = await as('PASTOR');
    const first = await ask(anna);
    expect(first.statusCode).toBe(201);
    const item = first.json().data;
    expect(item).toMatchObject({
      topic: 'Marriage and family',
      reason: REASON,
      status: 'requested',
      preferredTime: 'morning',
      startsAt: '',
      version: 1,
      history: [{ status: 'requested' }],
    });

    // A retry, two at once, and a simultaneous first send: one each.
    const [again, together] = await Promise.all([ask(anna), ask(anna)]);
    expect([again.statusCode, together.statusCode]).toEqual([200, 200]);
    expect(again.json().data.id).toBe(item.id);
    const [x, y] = await Promise.all([
      ask(anna, 'appt-key-race'),
      ask(anna, 'appt-key-race'),
    ]);
    expect([x.statusCode, y.statusCode].sort()).toEqual([200, 201]);
    expect(await prisma.appointment.count()).toBe(2);
    // The same key with different details is refused, also when racing.
    const changed = await ask(anna, 'appt-key-0001', { reason: 'Other' });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    const [p, q] = await Promise.all([
      ask(anna, 'appt-key-pair', { preferredTime: 'evening' }),
      ask(anna, 'appt-key-pair', { preferredTime: 'afternoon' }),
    ]);
    expect([p.statusCode, q.statusCode].sort()).toEqual([201, 409]);
    expect(await prisma.appointment.count()).toBe(3);
    expect(await notificationsOf(pastor)).toHaveLength(3);

    expect(
      (await call('GET', '/v1/member/appointments', ben)).json().data,
    ).toEqual([]);
    expect(
      (await call('GET', `/v1/member/appointments/${item.id}`, ben)).statusCode,
    ).toBe(404);
    expect((await memberDo(ben, item.id, 'cancel', 1)).statusCode).toBe(404);
    expect((await call('GET', '/v1/member/appointments')).statusCode).toBe(401);
    // Unknown topics are refused with the field named.
    const bad = await ask(anna, 'appt-key-bad1', { topic: 'Gossip' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.fieldErrors.topic).toBeTruthy();
  });

  it('Admin schedules with logistics only; members get nothing from staff routes', async () => {
    const anna = await as('MEMBER');
    const [pastor, admin] = [await as('PASTOR'), await as('ADMIN')];
    const id = (await ask(anna)).json().data.id;
    await call(
      'POST',
      `/v1/staff/appointments/${id}/notes`,
      pastor,
      { text: NOTE },
      1,
    );

    const list = await call('GET', '/v1/staff/appointments', admin);
    expect(list.statusCode).toBe(200);
    const [row] = list.json().data;
    expect(row.member).toMatchObject({ name: anna.user.email });
    for (const key of ['topic', 'reason', 'noteCount', 'notes'])
      expect(row).not.toHaveProperty(key);
    const detail = await call('GET', `/v1/staff/appointments/${id}`, admin);
    for (const key of ['topic', 'reason', 'noteCount', 'notes'])
      expect(detail.json().data).not.toHaveProperty(key);
    expect(JSON.stringify(list.json())).not.toContain(REASON);
    expect(JSON.stringify(detail.json())).not.toContain(NOTE);
    // Admin may schedule, but not decline or write notes.
    expect((await staffDo(admin, id, 'decline', 2)).statusCode).toBe(403);
    expect(
      (
        await call(
          'POST',
          `/v1/staff/appointments/${id}/notes`,
          admin,
          { text: NOTE },
          2,
        )
      ).statusCode,
    ).toBe(403);
    const proposed = await staffDo(admin, id, 'propose', 2, slot());
    expect(proposed.statusCode).toBe(200);
    expect(proposed.json().data).not.toHaveProperty('reason');

    // The Pastor sees everything.
    const full = (
      await call('GET', `/v1/staff/appointments/${id}`, pastor)
    ).json().data;
    expect(full).toMatchObject({
      topic: 'Marriage and family',
      reason: REASON,
    });
    expect(full.notes).toEqual([
      expect.objectContaining({ text: NOTE, author: pastor.user.email }),
    ]);

    // Members are refused on every staff route.
    expect((await call('GET', '/v1/staff/appointments', anna)).statusCode).toBe(
      403,
    );
    expect(
      (await call('GET', `/v1/staff/appointments/${id}`, anna)).statusCode,
    ).toBe(403);
    expect((await staffDo(anna, id, 'cancel', 3)).statusCode).toBe(403);
  });

  it('suggest, accept, complete; versions and transitions are enforced', async () => {
    const anna = await as('MEMBER');
    const pastor = await as('PASTOR');
    const id = (await ask(anna)).json().data.id;

    expect(
      (
        await call(
          'POST',
          `/v1/staff/appointments/${id}/propose`,
          pastor,
          slot(),
        )
      ).statusCode,
    ).toBe(428);
    expect((await staffDo(pastor, id, 'propose', 9, slot())).statusCode).toBe(
      412,
    );
    // Nothing to confirm without a time.
    const none = await staffDo(pastor, id, 'confirm', 1);
    expect(none.statusCode).toBe(409);
    expect(none.json().error.code).toBe('NO_TIME');
    // Not before it happened.
    expect((await staffDo(pastor, id, 'complete', 1)).statusCode).toBe(409);
    // A past time is refused.
    expect(
      (
        await staffDo(
          pastor,
          id,
          'propose',
          1,
          slot('10:00', 60, addDays(nzNow().date, -2)),
        )
      ).statusCode,
    ).toBe(422);

    const proposed = await staffDo(pastor, id, 'propose', 1, slot());
    expect(proposed.json().data).toMatchObject({
      status: 'proposed',
      location: 'Church office',
      version: 2,
    });
    // The member asks for another time: the suggestion is dropped.
    const back = await memberDo(anna, id, 'another-time', 2);
    expect(back.json().data).toMatchObject({
      status: 'requested',
      startsAt: '',
    });
    await staffDo(pastor, id, 'propose', 3, slot('14:00'));
    // A stale member action is refused.
    expect((await memberDo(anna, id, 'accept', 3)).statusCode).toBe(412);
    const accepted = await memberDo(anna, id, 'accept', 4);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().data).toMatchObject({
      status: 'confirmed',
      version: 5,
    });
    expect(accepted.json().data.startsAt).toBeTruthy();
    expect((await memberDo(anna, id, 'accept', 5)).json().error.code).toBe(
      'INVALID_TRANSITION',
    );

    const done = await staffDo(pastor, id, 'complete', 5);
    expect(done.json().data).toMatchObject({ status: 'completed' });
    expect(done.json().data.closedAt).toBeTruthy();
    expect(done.json().data.deleteAfter).toBeTruthy();
    expect((await staffDo(pastor, id, 'cancel', 6)).statusCode).toBe(409);
    expect((await memberDo(anna, id, 'cancel', 6)).statusCode).toBe(409);
    expect(
      (await call('GET', `/v1/member/appointments/${id}`, anna))
        .json()
        .data.history.map((entry: { status: string }) => entry.status),
    ).toEqual([
      'requested',
      'proposed',
      'requested',
      'proposed',
      'confirmed',
      'completed',
    ]);
  });

  it('confirmed times never overlap, even when confirmed at the same moment', async () => {
    const [anna, ben, cara] = [
      await as('MEMBER'),
      await as('MEMBER'),
      await as('MEMBER'),
    ];
    const [pastor, admin] = [await as('PASTOR'), await as('ADMIN')];
    const a = (await ask(anna)).json().data.id;
    const b = (await ask(ben)).json().data.id;
    const c = (await ask(cara)).json().data.id;

    // Suggestions reserve nothing: the same time can be suggested twice.
    expect((await staffDo(pastor, a, 'propose', 1, slot())).statusCode).toBe(
      200,
    );
    expect(
      (await staffDo(admin, b, 'propose', 1, slot('10:30'))).statusCode,
    ).toBe(200);

    // Two staff confirm overlapping times at once: exactly one wins.
    const [first, second] = await Promise.all([
      staffDo(pastor, a, 'confirm', 2),
      staffDo(admin, b, 'confirm', 2),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    const loser = first.statusCode === 409 ? first : second;
    expect(loser.json().error.code).toBe('SLOT_TAKEN');
    expect(
      await prisma.appointment.count({ where: { status: 'CONFIRMED' } }),
    ).toBe(1);

    // Suggesting a time that clashes with a confirmed one is refused…
    const clash = await staffDo(pastor, c, 'propose', 1, slot('10:15', 30));
    expect(clash.json().error.code).toBe('SLOT_TAKEN');
    // …but back-to-back is fine.
    expect(
      (await staffDo(pastor, c, 'propose', 1, slot('11:30', 30))).statusCode,
    ).toBe(200);
    // A member accepting a suggestion that now clashes is refused too.
    const loserId = first.statusCode === 409 ? a : b;
    const loserMember = loserId === a ? anna : ben;
    const late = await memberDo(loserMember, loserId, 'accept', 2);
    expect(late.json().error.code).toBe('SLOT_TAKEN');
    // Cancelling the confirmed one frees the time.
    const winnerId = loserId === a ? b : a;
    await staffDo(pastor, winnerId, 'cancel', 3);
    expect((await memberDo(loserMember, loserId, 'accept', 2)).statusCode).toBe(
      200,
    );

    // Appointments never reach the public calendar or Google.
    expect(await prisma.outboxEvent.count()).toBe(0);
    expect(await prisma.activity.count()).toBe(0);
    expect((await call('GET', '/v1/public/content')).payload).not.toContain(
      'Church office',
    );
  });

  it('notifications are generic, once per transition, with each role’s link; audits hold no words', async () => {
    const anna = await as('MEMBER');
    const [pastor, admin] = [await as('PASTOR'), await as('ADMIN')];
    const id = (await ask(anna)).json().data.id;
    // A retry does not notify again.
    await ask(anna);
    const [toPastor] = await notificationsOf(pastor);
    const [toAdmin] = await notificationsOf(admin);
    expect(toPastor!.href).toBe(`/pastor/care?appointment=${id}`);
    expect(toAdmin!.href).toBe(`/admin/appointments?appointment=${id}`);

    await call(
      'POST',
      `/v1/staff/appointments/${id}/notes`,
      pastor,
      { text: NOTE },
      1,
    );
    const proposed = await staffDo(admin, id, 'propose', 2, slot());
    // A replayed (stale) action changes nothing and notifies nobody.
    await staffDo(admin, id, 'propose', 2, slot());
    expect(proposed.statusCode).toBe(200);
    const memberSees = await notificationsOf(anna);
    expect(memberSees).toHaveLength(1);
    expect(memberSees[0]!.href).toBe(`/members/appointments?appointment=${id}`);
    // The actor is not told about their own action; the other staff are.
    expect(await notificationsOf(admin)).toHaveLength(1);
    await memberDo(anna, id, 'accept', 3);
    expect(await notificationsOf(pastor)).toHaveLength(2);
    expect(await notificationsOf(admin)).toHaveLength(2);
    expect(await notificationsOf(anna)).toHaveLength(1);

    const everything = JSON.stringify(
      await prisma.notification.findMany({
        select: { title: true, body: true, href: true },
      }),
    );
    for (const secret of [REASON, NOTE, 'Marriage', 'Church office'])
      expect(everything).not.toContain(secret);
    const audits = await prisma.auditEvent.findMany({
      where: { entityType: 'appointment' },
    });
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'care.appointment_requested',
        'care.appointment_note_added',
        'care.appointment_proposed',
        'care.appointment_confirmed',
      ]),
    );
    const logged = JSON.stringify(audits);
    for (const secret of [REASON, NOTE, 'Marriage', 'Church office'])
      expect(logged).not.toContain(secret);
  });

  it('closed appointments expire after 30 days with notes, history and notifications; never active or future ones', async () => {
    const anna = await as('MEMBER');
    const pastor = await as('PASTOR');
    const make = async (key: string) => {
      const id = (await ask(anna, key)).json().data.id as string;
      await call(
        'POST',
        `/v1/staff/appointments/${id}/notes`,
        pastor,
        { text: NOTE },
        1,
      );
      return id;
    };
    const old = await make('appt-key-old1');
    const recent = await make('appt-key-new1');
    const ahead = await make('appt-key-ahead');
    const open = await make('appt-key-open');
    for (const id of [old, recent, ahead])
      await staffDo(pastor, id, 'cancel', 2);

    const now = new Date(Date.now() + 120 * 86_400_000);
    const daysFromNow = (days: number) =>
      new Date(now.getTime() + days * 86_400_000);
    await prisma.appointment.update({
      where: { id: old },
      data: { closedAt: daysFromNow(-31) },
    });
    await prisma.appointment.update({
      where: { id: recent },
      data: { closedAt: daysFromNow(-29) },
    });
    // Closed long ago, but its time is still ahead: kept until it passes.
    await prisma.appointment.update({
      where: { id: ahead },
      data: {
        closedAt: daysFromNow(-31),
        startsAt: daysFromNow(1),
        endsAt: daysFromNow(1.05),
      },
    });
    // Open for a year: never age-deleted.
    await prisma.appointment.update({
      where: { id: open },
      data: { createdAt: daysFromNow(-365) },
    });

    expect(await expireAppointments(now)).toBe(1);
    expect(await expireAppointments(now)).toBe(0);
    const left = await prisma.appointment.findMany({ select: { id: true } });
    expect(left.map((row) => row.id).sort()).toEqual(
      [ahead, open, recent].sort(),
    );
    expect(
      await prisma.appointmentNote.count({ where: { appointmentId: old } }),
    ).toBe(0);
    expect(
      await prisma.appointmentEvent.count({ where: { appointmentId: old } }),
    ).toBe(0);
    expect(await prisma.notification.count({ where: { entityId: old } })).toBe(
      0,
    );
    expect(
      await prisma.notification.count({ where: { entityId: recent } }),
    ).toBeGreaterThan(0);
    expect(
      (await call('GET', `/v1/member/appointments/${old}`, anna)).statusCode,
    ).toBe(404);
    expect(await expireAppointments(daysFromNow(2))).toBe(2);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'care.appointments_expired' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit?.metadata).toEqual({ count: 1 });
  });
});
