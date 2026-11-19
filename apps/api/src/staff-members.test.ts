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

/*
 * Phase 4C: People. Both fixed staff accounts list, search and open
 * canonical accounts and suspend/reactivate ordinary members with the
 * version they loaded; suspension ends the member's sessions at once.
 * Staff accounts (each other, themselves, guessed ids) are never changed;
 * the old role/status routes are gone. Members get nothing. Responses hold
 * no credentials; care counts are role-scoped (Admin: appointment
 * logistics only, never prayer counts).
 */

describe.skipIf(!dbTestsEnabled)('People (PostgreSQL)', () => {
  const app = buildApp();
  beforeAll(() => app.ready());
  beforeEach(resetIdentityTables);
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
  async function as(role: 'MEMBER' | 'ADMIN' | 'PASTOR') {
    const user = await createUser({ role });
    return { user, headers: await headersFor(user.id) };
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
  const setStatus = (who: Who, id: string, status: string, version: number) =>
    call('PATCH', `/v1/staff/members/${id}/status`, who, { status }, version);
  const statusOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id } })).status;

  it('members get nothing; signed-out callers are asked to sign in', async () => {
    const member = await as('MEMBER');
    const other = await createUser();
    for (const url of [
      '/v1/staff/members',
      `/v1/staff/members/${other.id}`,
      '/v1/staff/summary',
    ]) {
      expect((await call('GET', url, member)).statusCode).toBe(403);
      expect((await call('GET', url)).statusCode).toBe(401);
    }
    expect((await setStatus(member, other.id, 'suspended', 1)).statusCode).toBe(
      403,
    );
    expect(await statusOf(other.id)).toBe('ACTIVE');
  });

  it('both staff search the real directory, page by page, without credentials', async () => {
    const [pastor, admin] = [await as('PASTOR'), await as('ADMIN')];
    const anna = await createUser();
    await prisma.user.update({
      where: { id: anna.id },
      data: { name: 'Anna Example', passwordHash: 'argon2-secret-hash' },
    });
    const ben = await createUser();
    await prisma.user.update({
      where: { id: ben.id },
      data: { name: 'Ben Sample', status: 'SUSPENDED' },
    });
    for (const who of [pastor, admin]) {
      const all = await call('GET', '/v1/staff/members', who);
      expect(all.statusCode).toBe(200);
      expect(all.json().data.items).toHaveLength(4);
      expect(all.body).not.toContain('argon2-secret-hash');
      for (const key of ['passwordHash', 'sessionVersion', 'phone'])
        expect(all.json().data.items[0]).not.toHaveProperty(key);
    }
    const search = await call('GET', '/v1/staff/members?q=anna', admin);
    expect(
      search.json().data.items.map((item: { id: string }) => item.id),
    ).toEqual([anna.id]);
    // Email search is case-insensitive too.
    const byEmail = await call(
      'GET',
      `/v1/staff/members?q=${ben.email.toUpperCase().slice(0, 8)}`,
      pastor,
    );
    expect(
      byEmail.json().data.items.map((item: { id: string }) => item.id),
    ).toContain(ben.id);
    const suspended = await call(
      'GET',
      '/v1/staff/members?status=suspended',
      pastor,
    );
    expect(
      suspended.json().data.items.map((item: { id: string }) => item.id),
    ).toEqual([ben.id]);
    const staffOnly = (
      await call('GET', '/v1/staff/members?role=staff', pastor)
    ).json().data.items;
    expect(staffOnly.map((item: { id: string }) => item.id).sort()).toEqual(
      [pastor.user.id, admin.user.id].sort(),
    );
    // Staff rows are never manageable; ordinary members are.
    expect(
      staffOnly.every((item: { manageable: boolean }) => !item.manageable),
    ).toBe(true);

    // Bounded pages with a cursor cover everyone exactly once.
    const seen: string[] = [];
    let cursor = '';
    for (let page = 0; page < 5; page++) {
      const response = await call(
        'GET',
        `/v1/staff/members?limit=3&cursor=${encodeURIComponent(cursor)}`,
        admin,
      );
      const data = response.json().data;
      seen.push(...data.items.map((item: { id: string }) => item.id));
      cursor = data.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
    expect(
      (await call('GET', '/v1/staff/members?limit=500', admin)).statusCode,
    ).toBe(422);
  });

  it('a person’s detail is role-scoped: Admin gets appointment logistics counts, never prayer counts', async () => {
    const [pastor, admin] = [await as('PASTOR'), await as('ADMIN')];
    const anna = await createUser();
    await prisma.prayerRequest.create({
      data: { userId: anna.id, text: 'Private words', clientKey: 'k-1' },
    });
    await prisma.appointment.create({
      data: {
        userId: anna.id,
        topic: 'Prayer',
        reason: 'Private reason',
        clientKey: 'k-2',
      },
    });
    const forAdmin = await call('GET', `/v1/staff/members/${anna.id}`, admin);
    expect(forAdmin.statusCode).toBe(200);
    expect(forAdmin.json().data).toMatchObject({
      id: anna.id,
      role: 'member',
      status: 'active',
      manageable: true,
      appointments: { requested: 1, confirmed: 0 },
    });
    expect(forAdmin.json().data).not.toHaveProperty('prayers');
    for (const secret of ['Private words', 'Private reason', 'Prayer'])
      expect(forAdmin.body).not.toContain(secret);
    const forPastor = await call('GET', `/v1/staff/members/${anna.id}`, pastor);
    expect(forPastor.json().data.prayers).toEqual({
      submitted: 1,
      praying: 0,
      prayedFor: 0,
    });
    expect(forPastor.body).not.toContain('Private words');
    expect(
      (await call('GET', '/v1/staff/members/not-a-real-id', pastor)).statusCode,
    ).toBe(404);
  });

  it('both staff suspend and reactivate an ordinary member with the version they loaded', async () => {
    const [pastor, admin] = [await as('PASTOR'), await as('ADMIN')];
    const memberUser = await createUser();
    const member = {
      user: memberUser,
      headers: await headersFor(memberUser.id),
    };
    const other = await headersFor(memberUser.id); // a second device

    expect(
      (
        await call(
          'PATCH',
          `/v1/staff/members/${member.user.id}/status`,
          admin,
          { status: 'suspended' },
        )
      ).statusCode,
    ).toBe(428);
    expect(
      (await setStatus(admin, member.user.id, 'suspended', 5)).statusCode,
    ).toBe(412);
    expect(
      (await setStatus(admin, member.user.id, 'paused', 1)).statusCode,
    ).toBe(422);

    const suspended = await setStatus(admin, member.user.id, 'suspended', 1);
    expect(suspended.statusCode).toBe(200);
    expect(suspended.json().data).toMatchObject({
      status: 'suspended',
      version: 2,
    });
    // Every session ends at once, on every device.
    expect((await call('GET', '/v1/me', member)).statusCode).toBe(403);
    expect(
      (await call('GET', '/v1/me', { ...member, headers: other })).statusCode,
    ).toBe(403);
    expect(
      await prisma.userSession.count({
        where: { userId: member.user.id, revokedAt: null },
      }),
    ).toBe(0);
    // Asking again with the new version is refused, not repeated.
    const again = await setStatus(pastor, member.user.id, 'suspended', 2);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('NO_CHANGE');

    const back = await setStatus(pastor, member.user.id, 'active', 2);
    expect(back.json().data).toMatchObject({ status: 'active', version: 3 });
    // Old sessions stay ended; a new sign-in works.
    expect((await call('GET', '/v1/me', member)).statusCode).toBe(401);
    expect(
      (
        await call('GET', '/v1/me', {
          ...member,
          headers: await headersFor(member.user.id),
        })
      ).statusCode,
    ).toBe(200);

    const audits = await prisma.auditEvent.findMany({
      where: { entityId: member.user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((row) => [row.action, row.actorId])).toEqual([
      ['member.suspended', admin.user.id],
      ['member.reactivated', pastor.user.id],
    ]);
    expect(audits[0]!.metadata).toMatchObject({
      previousStatus: 'ACTIVE',
      actorRole: 'ADMIN',
    });
  });

  it('staff accounts are protected: each other, themselves and guessed ids', async () => {
    const [pastor, admin] = [await as('PASTOR'), await as('ADMIN')];
    const secondPastor = await createUser({ role: 'PASTOR' });
    for (const [who, target] of [
      [pastor, admin.user.id],
      [admin, pastor.user.id],
      [admin, secondPastor.id],
      [pastor, pastor.user.id],
      [admin, admin.user.id],
    ] as const) {
      const response = await setStatus(who, target, 'suspended', 1);
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('STAFF_PROTECTED');
    }
    for (const id of [pastor.user.id, admin.user.id, secondPastor.id])
      expect(await statusOf(id)).toBe('ACTIVE');
    expect(
      (await setStatus(pastor, 'guessed-id', 'suspended', 1)).statusCode,
    ).toBe(404);
    // Staff sessions keep working.
    expect((await call('GET', '/v1/me', admin)).statusCode).toBe(200);
    // An account being deleted is not reactivated here.
    const leaving = await createUser();
    await prisma.user.update({
      where: { id: leaving.id },
      data: { status: 'DELETION_PENDING' },
    });
    const locked = await setStatus(pastor, leaving.id, 'active', 1);
    expect(locked.json().error.code).toBe('ACCOUNT_LOCKED');
    expect(await statusOf(leaving.id)).toBe('DELETION_PENDING');
  });

  it('two staff changing the same member at once: exactly one change commits', async () => {
    const [pastor, admin] = [await as('PASTOR'), await as('ADMIN')];
    const member = await createUser();
    const [a, b] = await Promise.all([
      setStatus(pastor, member.id, 'suspended', 1),
      setStatus(admin, member.id, 'suspended', 1),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 412]);
    expect(
      await prisma.auditEvent.count({ where: { action: 'member.suspended' } }),
    ).toBe(1);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: member.id } }))
        .version,
    ).toBe(2);
  });

  it('a staff account that lost its role or session can’t finish a change', async () => {
    const admin = await as('ADMIN');
    const member = await createUser();
    await prisma.user.update({
      where: { id: admin.user.id },
      data: { role: 'MEMBER' },
    });
    expect((await setStatus(admin, member.id, 'suspended', 1)).statusCode).toBe(
      403,
    );
    const pastor = await as('PASTOR');
    await prisma.userSession.updateMany({
      where: { userId: pastor.user.id },
      data: { revokedAt: new Date() },
    });
    expect(
      (await setStatus(pastor, member.id, 'suspended', 1)).statusCode,
    ).toBe(401);
    expect(await statusOf(member.id)).toBe('ACTIVE');
  });

  it('needs a recent sign-in: a stale staff session changes nothing until it confirms', async () => {
    const pastorUser = await createUser({ role: 'PASTOR' });
    const staleSession = await createSession(pastorUser.id, {
      authenticatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const token = await new SignJWT({ sid: staleSession.id, sv: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(pastorUser.id)
      .setIssuer('grace-web')
      .setAudience('grace-api')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(new TextEncoder().encode(process.env.API_ASSERTION_SECRET!));
    const pastor = {
      user: pastorUser,
      headers: { authorization: `Bearer ${token}` },
    };
    const memberUser = await createUser();
    const member = {
      user: memberUser,
      headers: await headersFor(memberUser.id),
    };

    const refused = await setStatus(pastor, member.user.id, 'suspended', 1);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('REAUTH_REQUIRED');
    // Nothing changed: status, version, sessions, audit.
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: member.user.id },
    });
    expect([after.status, after.version, after.sessionVersion]).toEqual([
      'ACTIVE',
      1,
      1,
    ]);
    expect((await call('GET', '/v1/me', member)).statusCode).toBe(200);
    expect(await prisma.auditEvent.count()).toBe(0);

    // "Confirm it's you" records a fresh sign-in on this session; the
    // same request then goes through.
    await prisma.userSession.update({
      where: { id: staleSession.id },
      data: { authenticatedAt: new Date() },
    });
    const done = await setStatus(pastor, member.user.id, 'suspended', 1);
    expect(done.statusCode).toBe(200);
    expect((await call('GET', '/v1/me', member)).statusCode).toBe(403);
  });

  it('Home summaries: real counts, members exclude staff, prayer counts for the Pastor only', async () => {
    const [pastor, admin] = [await as('PASTOR'), await as('ADMIN')];
    const anna = await createUser();
    const ben = await createUser();
    await prisma.user.update({
      where: { id: ben.id },
      data: { status: 'SUSPENDED' },
    });
    await prisma.prayerRequest.createMany({
      data: [
        { userId: anna.id, text: 'a', clientKey: 'p1' },
        { userId: anna.id, text: 'b', clientKey: 'p2', status: 'PRAYING' },
        { userId: ben.id, text: 'c', clientKey: 'p3', status: 'PRAYED_FOR' },
      ],
    });
    await prisma.appointment.createMany({
      data: [
        { userId: anna.id, topic: 'Prayer', clientKey: 'a1' },
        {
          userId: ben.id,
          topic: 'Baptism',
          clientKey: 'a2',
          status: 'CONFIRMED',
        },
      ],
    });
    await prisma.sermon.createMany({
      data: [
        {
          slug: 'live-one',
          title: 'Live',
          date: new Date('2026-11-01'),
          liveVersion: 1,
          live: {},
          review: 'APPROVED',
        },
        {
          slug: 'waiting',
          title: 'Waiting',
          date: new Date('2026-11-08'),
          review: 'PENDING',
        },
        { slug: 'draft', title: 'Draft', date: new Date('2026-11-15') },
      ],
    });

    const forPastor = (await call('GET', '/v1/staff/summary', pastor)).json()
      .data;
    expect(forPastor).toEqual({
      members: { active: 1, suspended: 1 },
      sermons: { published: 1, awaitingApproval: 1 },
      appointments: {
        requested: 1,
        proposed: 0,
        confirmed: 1,
        completed: 0,
        cancelled: 0,
        declined: 0,
      },
      prayers: { submitted: 1, praying: 1, prayedFor: 1 },
    });
    const response = await call('GET', '/v1/staff/summary', admin);
    expect(response.json().data).toEqual({
      members: forPastor.members,
      sermons: forPastor.sermons,
      appointments: forPastor.appointments,
    });
    expect(response.body).not.toContain('prayer');
  });
});
