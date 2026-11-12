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
import {
  defaultPages,
  defaultSiteSettings,
  pageKeys,
} from '@grace-abounds/validation';
import { buildApp } from './app.js';

async function seedContent() {
  await prisma.siteSettings.create({
    data: { id: 'site', data: defaultSiteSettings },
  });
  for (const key of pageKeys)
    await prisma.pageContent.create({ data: { key, data: defaultPages[key] } });
}

describe.skipIf(!dbTestsEnabled)('website content API (PostgreSQL)', () => {
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
  const call = (method: string, url: string, headers = {}, body?: unknown) =>
    app.inject({
      method: method as never,
      url,
      headers,
      ...(body !== undefined && { payload: body as never }),
    });
  const editedHome = {
    ...defaultPages.home,
    hero: { ...defaultPages.home.hero, title: 'Welcome home' },
  };

  it('reports unavailable content until it is set up', async () => {
    expect((await call('GET', '/v1/public/content')).statusCode).toBe(503);
  });

  it('serves published site and pages without editor metadata', async () => {
    await seedContent();
    const response = await call('GET', '/v1/public/content');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body.data.pages).sort()).toEqual([...pageKeys].sort());
    expect(body.data.site.giving.bank).toBe(defaultSiteSettings.giving.bank);
    expect(response.body).not.toMatch(/updatedById|version|actorId/);
    expect(
      (await call('GET', '/v1/public/pages/about')).json().data.ministryYears,
    ).toBe('12+');
    expect((await call('GET', '/v1/public/pages/not-a-page')).statusCode).toBe(
      404,
    );
  });

  it('only Pastors and Admins can read or save staff content', async () => {
    await seedContent();
    expect((await call('GET', '/v1/staff/pages/home')).statusCode).toBe(401);
    const member = await as('MEMBER');
    expect(
      (await call('GET', '/v1/staff/pages/home', member.headers)).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          'PATCH',
          '/v1/staff/pages/home',
          { ...member.headers, 'if-match': '"1"' },
          editedHome,
        )
      ).statusCode,
    ).toBe(403);
    for (const role of ['ADMIN', 'PASTOR'] as const) {
      const staff = await as(role);
      expect(
        (await call('GET', '/v1/staff/site', staff.headers)).statusCode,
      ).toBe(200);
    }
  });

  it('saving publishes immediately and records a revision and audit event', async () => {
    await seedContent();
    const admin = await as('ADMIN');
    const saved = await call(
      'PATCH',
      '/v1/staff/pages/home',
      { ...admin.headers, 'if-match': '"1"' },
      editedHome,
    );
    expect(saved.statusCode).toBe(200);
    expect(saved.json().version).toBe(2);
    expect(saved.headers.etag).toBe('"2"');
    expect(
      (await call('GET', '/v1/public/pages/home')).json().data.hero.title,
    ).toBe('Welcome home');
    const revision = await prisma.contentRevision.findUniqueOrThrow({
      where: {
        entityType_entityKey_version: {
          entityType: 'page',
          entityKey: 'home',
          version: 2,
        },
      },
    });
    expect(revision.actorId).toBe(admin.user.id);
    expect(
      await prisma.auditEvent.count({
        where: {
          action: 'content.page_published',
          entityId: 'home',
          actorId: admin.user.id,
        },
      }),
    ).toBe(1);
  });

  it('rejects stale, missing-version and invalid saves without changing content', async () => {
    await seedContent();
    const pastor = await as('PASTOR');
    const stale = await call(
      'PATCH',
      '/v1/staff/site',
      { ...pastor.headers, 'if-match': '"7"' },
      defaultSiteSettings,
    );
    expect(stale.statusCode).toBe(412);
    expect(stale.json().error.code).toBe('VERSION_CONFLICT');
    expect(
      (
        await call(
          'PATCH',
          '/v1/staff/site',
          pastor.headers,
          defaultSiteSettings,
        )
      ).statusCode,
    ).toBe(428);
    const invalid = await call(
      'PATCH',
      '/v1/staff/site',
      { ...pastor.headers, 'if-match': '"1"' },
      {
        ...defaultSiteSettings,
        social: { ...defaultSiteSettings.social, youtube: 'http://x' },
      },
    );
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.fieldErrors['social.youtube']).toBeTruthy();
    expect(
      (await prisma.siteSettings.findUniqueOrThrow({ where: { id: 'site' } }))
        .version,
    ).toBe(1);
  });

  it('two editors saving the same version: one wins, the other gets a conflict', async () => {
    await seedContent();
    const [a, b] = [await as('ADMIN'), await as('PASTOR')];
    const save = (who: typeof a, title: string) =>
      call(
        'PATCH',
        '/v1/staff/pages/events',
        { ...who.headers, 'if-match': '"1"' },
        { hero: { ...defaultPages.events.hero, title } },
      );
    const results = await Promise.all([save(a, 'From A'), save(b, 'From B')]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 412]);
    expect(
      await prisma.contentRevision.count({
        where: { entityType: 'page', entityKey: 'events' },
      }),
    ).toBe(1);
  });
});
