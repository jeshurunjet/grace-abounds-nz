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
import { drainOutbox } from './lib/outbox.js';

/*
 * Phase 2C: revision history, versioned audited restore and the
 * content-change outbox.
 */

const recording = 'https://media.example.org/sermons/walking.mp4';
const sermon = {
  title: 'Walking in the Spirit',
  series: '',
  speaker: 'Pastor Example',
  date: '2026-10-04',
  duration: '42 min',
  image: '',
  summary: 'First summary.',
  mediaUrl: recording,
};
const resource = {
  title: 'Guide',
  description: '',
  type: 'PDF',
  url: '/next-steps',
  folderId: null,
  visibility: 'public',
  status: 'published',
};

describe.skipIf(!dbTestsEnabled)(
  'revision history and restore (PostgreSQL)',
  () => {
    const app = buildApp();
    beforeAll(() => app.ready());
    beforeEach(async () => {
      await resetIdentityTables();
      await prisma.siteSettings.create({
        data: { id: 'site', data: defaultSiteSettings },
      });
      for (const key of pageKeys)
        await prisma.pageContent.create({
          data: { key, data: defaultPages[key] },
        });
    });
    afterAll(async () => {
      await app.close();
      await prisma.$disconnect();
    });

    async function as(role: 'MEMBER' | 'ADMIN' | 'PASTOR', name?: string) {
      const user = await createUser({ role });
      if (name)
        await prisma.user.update({ where: { id: user.id }, data: { name } });
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
    const history = async (who: Who, entityType: string, entityKey: string) =>
      (
        await call(
          'GET',
          `/v1/staff/revisions?entityType=${entityType}&entityKey=${entityKey}`,
          who,
        )
      ).json().data as {
        id: string;
        version: number;
        by: string | null;
        restoredFromVersion: number | null;
        data: Record<string, unknown>;
      }[];
    const restore = (who: Who, id: string, version: number) =>
      call('POST', `/v1/staff/revisions/${id}/restore`, who, version);
    const savePage = (who: Who, version: number, data: unknown) =>
      call('PATCH', '/v1/staff/pages/about', who, version, data);
    const publicAbout = async () =>
      (await call('GET', '/v1/public/content')).json().data.pages.about;

    it('history and restore are staff only', async () => {
      const member = await as('MEMBER');
      expect(
        (
          await call(
            'GET',
            '/v1/staff/revisions?entityType=page&entityKey=about',
          )
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await call(
            'GET',
            '/v1/staff/revisions?entityType=page&entityKey=about',
            member,
          )
        ).statusCode,
      ).toBe(403);
      const admin = await as('ADMIN');
      expect(
        (
          await call(
            'GET',
            '/v1/staff/revisions?entityType=users&entityKey=x',
            admin,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (await call('POST', '/v1/staff/revisions/missing/restore', member, 1))
          .statusCode,
      ).toBe(403);
    });

    it('a page restore is a new audited version, keeps the fixed heading and refreshes public content', async () => {
      const admin = await as('ADMIN', 'Office Admin');
      const home = defaultPages.home as Record<string, unknown> & {
        hero: Record<string, unknown>;
        verse: Record<string, unknown>;
      };
      const withVerse = (text: string) => ({
        ...home,
        verse: { ...home.verse, text },
      });
      const saveHome = (version: number, data: unknown) =>
        call('PATCH', '/v1/staff/pages/home', admin, version, data);
      const publicHome = async () =>
        (await call('GET', '/v1/public/content')).json().data.pages.home;
      expect((await saveHome(1, withVerse('Verse two.'))).statusCode).toBe(200);
      expect((await saveHome(2, withVerse('Verse three.'))).statusCode).toBe(
        200,
      );
      // An old revision whose heading differs (e.g. from before headings were
      // fixed) must not bring that heading back.
      const old = await prisma.contentRevision.create({
        data: {
          entityType: 'page',
          entityKey: 'home',
          version: 0,
          data: {
            ...withVerse('Verse one.'),
            hero: { ...home.hero, title: 'Old heading' },
          },
        },
      });
      const outboxBefore = await prisma.outboxEvent.count();
      // Stale If-Match: nothing changes.
      expect((await restore(admin, old.id, 2)).statusCode).toBe(412);
      expect(await prisma.outboxEvent.count()).toBe(outboxBefore);

      const restored = await restore(admin, old.id, 3);
      expect(restored.statusCode).toBe(200);
      expect(restored.json().version).toBe(4);
      const live = await publicHome();
      expect(live.verse.text).toBe('Verse one.');
      expect(live.hero).toEqual(home.hero);

      const list = await history(admin, 'page', 'home');
      expect(list.map((row) => row.version)).toEqual([4, 3, 2, 0]);
      expect(list[0]).toMatchObject({
        restoredFromVersion: 0,
        by: 'Office Admin',
      });
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'content.page_version_restored', entityId: 'home' },
      });
      expect(audit.metadata).toMatchObject({
        version: 4,
        restoredFromVersion: 0,
      });
      expect(await prisma.outboxEvent.count()).toBe(outboxBefore + 1);

      // A page without a heading (About) restores without one.
      const about = defaultPages.about as Record<string, unknown>;
      await savePage(admin, 1, { ...about, story: 'Story two.' });
      const aboutOld = await prisma.contentRevision.create({
        data: {
          entityType: 'page',
          entityKey: 'about',
          version: 0,
          data: { ...about, story: 'Story one.', hero: { title: 'x' } },
        },
      });
      expect((await restore(admin, aboutOld.id, 2)).statusCode).toBe(200);
      expect((await publicAbout()).story).toBe('Story one.');
      expect(await publicAbout()).not.toHaveProperty('hero');
    });

    it('a record restore brings back content but never its old status or audience', async () => {
      const [admin, pastor] = [await as('ADMIN'), await as('PASTOR')];
      const { id } = (
        await call('POST', '/v1/staff/resources', admin, undefined, resource)
      ).json().data;
      await call('PATCH', `/v1/staff/resources/${id}`, admin, 1, {
        ...resource,
        title: 'Guide (members)',
        visibility: 'members',
        status: 'draft',
      });
      const [, first] = await history(admin, 'resources', id);
      expect(first!.version).toBe(1);
      expect((await restore(admin, first!.id, 2)).statusCode).toBe(200);
      const row = await prisma.resource.findUniqueOrThrow({ where: { id } });
      expect([row.title, row.visibility, row.status, row.version]).toEqual([
        'Guide',
        'MEMBERS',
        'DRAFT',
        3,
      ]);

      // An outside link the Pastor published, later replaced: Admin cannot
      // bring it back by restoring; the Pastor can.
      const link = (
        await call('POST', '/v1/staff/resources', pastor, undefined, {
          ...resource,
          url: 'https://example.org/notes.pdf',
        })
      ).json().data;
      await call('PATCH', `/v1/staff/resources/${link.id}`, admin, 1, {
        ...resource,
      });
      const linkV1 = (await history(admin, 'resources', link.id)).find(
        (rev) => rev.version === 1,
      )!;
      const refused = await restore(admin, linkV1.id, 2);
      expect(refused.statusCode).toBe(403);
      expect(refused.json().error.code).toBe('PASTOR_REVIEW_REQUIRED');
      expect((await restore(pastor, linkV1.id, 2)).statusCode).toBe(200);

      // A version that breaks today's rules is refused, not saved.
      const bad = await prisma.contentRevision.create({
        data: {
          entityType: 'resources',
          entityKey: id,
          version: 0,
          data: { ...resource, url: '/\\video.example/watch' },
        },
      });
      const invalid = await restore(admin, bad.id, 3);
      expect(invalid.statusCode).toBe(422);
      expect(invalid.json().error.code).toBe('REVISION_INVALID');
      expect(
        (await prisma.resource.findUniqueOrThrow({ where: { id } })).version,
      ).toBe(3);
    });

    it('a sermon restore changes only the working copy; what is live stays as approved', async () => {
      const [admin, pastor] = [await as('ADMIN'), await as('PASTOR')];
      const { id } = (
        await call('POST', '/v1/staff/sermons', admin, undefined, sermon)
      ).json().data;
      await call('POST', `/v1/staff/sermons/${id}/submit`, admin, 1);
      await call('POST', `/v1/staff/sermons/${id}/approve`, pastor, 2);
      const replacement = 'https://media.example.org/sermons/other.mp4';
      await call('PATCH', `/v1/staff/sermons/${id}`, admin, 3, {
        ...sermon,
        summary: 'Unapproved summary.',
        mediaUrl: replacement,
      });
      const publicSermons = async () =>
        (await call('GET', '/v1/public/content')).json().data.collections
          .sermons;
      // Restoring the unapproved working copy (v4) after going back to the
      // approved content: still not public, and it needs approval again.
      const revisions = await history(admin, 'sermons', id);
      const v1 = revisions.find((rev) => rev.version === 1)!;
      const v4 = revisions.find((rev) => rev.version === 4)!;
      const back = await restore(admin, v1.id, 4);
      expect(back.statusCode).toBe(200);
      let row = await prisma.sermon.findUniqueOrThrow({ where: { id } });
      expect([row.review, row.liveVersion]).toEqual(['APPROVED', 2]);
      expect(await restore(admin, v4.id, 5).then((r) => r.statusCode)).toBe(
        200,
      );
      row = await prisma.sermon.findUniqueOrThrow({ where: { id } });
      expect([row.review, row.mediaUrl, row.liveVersion]).toEqual([
        'DRAFT',
        replacement,
        2,
      ]);
      const [live] = await publicSermons();
      expect([live.mediaUrl, live.summary]).toEqual([
        recording,
        'First summary.',
      ]);
      // Restoring a version that was pending does not make it pending again.
      expect(row.approvedById).toBe(pastor.user.id);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'content.sermon_version_restored', entityId: id },
        }),
      ).toBe(2);
    });

    it('the outbox records committed changes only and delivers them with retries', async () => {
      const admin = await as('ADMIN');
      const stamp = async () =>
        (await call('GET', '/v1/public/content/stamp')).json().data.stamp;
      const before = await stamp();
      const about = defaultPages.about as Record<string, unknown>;
      // A refused save leaves no event.
      expect((await savePage(admin, 9, about)).statusCode).toBe(412);
      expect(await stamp()).toBe(before);
      await savePage(admin, 1, { ...about, story: 'Changed.' });
      const after = await stamp();
      expect(after).not.toBe(before);

      // Failed delivery: kept, retried later, error recorded.
      const failing = await drainOutbox({
        'content.changed': async () => {
          throw new Error('website unreachable');
        },
      });
      expect(failing).toBeGreaterThan(0);
      const pending = await prisma.outboxEvent.findFirstOrThrow({
        orderBy: { id: 'desc' },
      });
      expect(pending.processedAt).toBeNull();
      expect(pending.attempts).toBe(1);
      expect(pending.lastError).toBe('website unreachable');
      expect(pending.availableAt.getTime()).toBeGreaterThan(Date.now());

      // Once due, it is delivered (once per batch) and marked processed.
      await prisma.outboxEvent.updateMany({
        data: { availableAt: new Date(0) },
      });
      const delivered: number[][] = [];
      await drainOutbox({
        'content.changed': async (events) => {
          delivered.push(events.map((event) => event.id));
        },
      });
      expect(delivered).toHaveLength(1);
      expect(
        await prisma.outboxEvent.count({ where: { processedAt: null } }),
      ).toBe(0);
      // The stamp is about change, not delivery: unchanged.
      expect(await stamp()).toBe(after);
    });
  },
);
