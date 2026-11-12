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

const sermon = {
  title: 'Walking in the Spirit',
  series: 'Life in the Spirit',
  speaker: 'Pastor Example',
  date: '2026-10-04',
  duration: '42 min',
  image: '',
  summary: 'A practical message.',
  mediaUrl: 'https://media.example.org/sermons/walking.mp4',
};

describe.skipIf(!dbTestsEnabled)(
  'sermons and Pastor video approval (PostgreSQL)',
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
    const publicSermons = async () =>
      (await call('GET', '/v1/public/content')).json().data.collections.sermons;
    async function create(who: Who, body = sermon) {
      const response = await call(
        'POST',
        '/v1/staff/sermons',
        who,
        undefined,
        body,
      );
      expect(response.statusCode).toBe(201);
      return response.json().data as {
        id: string;
        version: number;
        slug: string;
      };
    }
    const act = (
      who: Who,
      id: string,
      step: string,
      version: number,
      body?: unknown,
    ) => call('POST', `/v1/staff/sermons/${id}/${step}`, who, version, body);

    it('only staff work on sermons, and only the Pastor approves, rejects or unpublishes', async () => {
      const [member, admin, pastor] = [
        await as('MEMBER'),
        await as('ADMIN'),
        await as('PASTOR'),
      ];
      expect((await call('GET', '/v1/staff/sermons')).statusCode).toBe(401);
      expect((await call('GET', '/v1/staff/sermons', member)).statusCode).toBe(
        403,
      );
      expect(
        (await call('POST', '/v1/staff/sermons', member, undefined, sermon))
          .statusCode,
      ).toBe(403);
      const { id } = await create(admin);
      expect((await act(admin, id, 'submit', 1)).statusCode).toBe(200);
      for (const step of ['approve', 'reject', 'unpublish'])
        expect(
          (
            await act(
              admin,
              id,
              step,
              2,
              step === 'reject' ? { note: 'x' } : undefined,
            )
          ).statusCode,
        ).toBe(403);
      expect(await publicSermons()).toEqual([]);
      expect((await act(pastor, id, 'approve', 2)).statusCode).toBe(200);
      expect(await publicSermons()).toHaveLength(1);
    });

    it('save never publishes; review fields cannot be sent; drafts and pending stay private', async () => {
      const admin = await as('ADMIN');
      const { id, slug } = await create(admin);
      expect(slug).toBe('walking-in-the-spirit');
      const sneaky = await call('PATCH', `/v1/staff/sermons/${id}`, admin, 1, {
        ...sermon,
        review: 'approved',
      });
      expect(sneaky.statusCode).toBe(422);
      const insecure = await call(
        'PATCH',
        `/v1/staff/sermons/${id}`,
        admin,
        1,
        {
          ...sermon,
          mediaUrl: 'http://media.example.org/walking.mp4',
        },
      );
      expect(insecure.statusCode).toBe(422);
      expect(insecure.json().error.fieldErrors.mediaUrl).toBeTruthy();
      const saved = await call('PATCH', `/v1/staff/sermons/${id}`, admin, 1, {
        ...sermon,
        title: 'Walking in the Spirit (part 1)',
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().data).toMatchObject({
        review: 'draft',
        live: null,
        version: 2,
      });
      expect(await publicSermons()).toEqual([]);
      await act(admin, id, 'submit', 2);
      expect(await publicSermons()).toEqual([]);
      // The slug is fixed on create, whatever the title becomes.
      expect(
        (await prisma.sermon.findUniqueOrThrow({ where: { id } })).slug,
      ).toBe('walking-in-the-spirit');
    });

    it('the Pastor approves the exact saved version; the approval is audited', async () => {
      const [admin, pastor] = [await as('ADMIN'), await as('PASTOR')];
      const { id } = await create(admin);
      // Approving needs a pending request.
      expect((await act(pastor, id, 'approve', 1)).json().error.code).toBe(
        'NOT_PENDING',
      );
      await act(admin, id, 'submit', 1);
      // A stale version (the Pastor reviewed something else) is refused.
      expect((await act(pastor, id, 'approve', 1)).statusCode).toBe(412);
      expect((await act(pastor, id, 'approve', 2)).statusCode).toBe(200);
      const [live] = await publicSermons();
      expect(live).toMatchObject({
        slug: 'walking-in-the-spirit',
        title: sermon.title,
        mediaUrl: sermon.mediaUrl,
      });
      expect(live).not.toHaveProperty('review');
      expect(live).not.toHaveProperty('version');
      const row = await prisma.sermon.findUniqueOrThrow({ where: { id } });
      expect([row.liveVersion, row.approvedById, row.review]).toEqual([
        2,
        pastor.user.id,
        'APPROVED',
      ]);
      expect(
        await prisma.contentRevision.count({
          where: { entityType: 'sermons', entityKey: id },
        }),
      ).toBe(3);
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'content.sermon_approved', entityId: id },
      });
      expect(audit.actorId).toBe(pastor.user.id);
      expect(audit.metadata).toMatchObject({ approvedVersion: 2 });
    });

    it('a replacement needs approval again while the approved version stays live', async () => {
      const [admin, pastor] = [await as('ADMIN'), await as('PASTOR')];
      const { id } = await create(admin);
      await act(admin, id, 'submit', 1);
      await act(pastor, id, 'approve', 2);
      const replacement = 'https://media.example.org/sermons/walking-v2.mp4';
      const saved = await call('PATCH', `/v1/staff/sermons/${id}`, admin, 3, {
        ...sermon,
        mediaUrl: replacement,
      });
      expect(saved.json().data).toMatchObject({
        review: 'draft',
        changedSinceApproval: true,
        live: { version: 2, mediaUrl: sermon.mediaUrl },
      });
      expect((await publicSermons())[0].mediaUrl).toBe(sermon.mediaUrl);
      await act(admin, id, 'submit', 4);
      expect((await publicSermons())[0].mediaUrl).toBe(sermon.mediaUrl);

      // Sent back with a note: still the old recording on the site.
      expect(
        (await act(pastor, id, 'reject', 5, { note: ' ' })).statusCode,
      ).toBe(422);
      const rejected = await act(pastor, id, 'reject', 5, {
        note: 'Audio drops at 12:30.',
      });
      expect(rejected.json().data).toMatchObject({
        review: 'rejected',
        reviewNote: 'Audio drops at 12:30.',
      });
      expect((await publicSermons())[0].mediaUrl).toBe(sermon.mediaUrl);

      // Fixed, resubmitted and approved: the replacement goes live.
      await act(admin, id, 'submit', 6);
      expect((await act(pastor, id, 'approve', 7)).statusCode).toBe(200);
      expect((await publicSermons())[0].mediaUrl).toBe(replacement);

      // Editing a pending version withdraws the request.
      await call('PATCH', `/v1/staff/sermons/${id}`, admin, 8, {
        ...sermon,
        mediaUrl: replacement,
        summary: 'Changed.',
      });
      await act(admin, id, 'submit', 9);
      const edited = await call('PATCH', `/v1/staff/sermons/${id}`, admin, 10, {
        ...sermon,
        mediaUrl: replacement,
        summary: 'Changed again.',
      });
      expect(edited.json().data.review).toBe('draft');
      expect((await act(pastor, id, 'approve', 11)).json().error.code).toBe(
        'NOT_PENDING',
      );
    });

    it('unpublish, archive, restore and delete never publish anything', async () => {
      const [admin, pastor] = [await as('ADMIN'), await as('PASTOR')];
      const { id } = await create(admin);
      await act(admin, id, 'submit', 1);
      await act(pastor, id, 'approve', 2);
      const blocked = await call('DELETE', `/v1/staff/sermons/${id}`, admin, 3);
      expect(blocked.json().error.code).toBe('ARCHIVE_FIRST');
      expect((await act(pastor, id, 'unpublish', 3)).statusCode).toBe(200);
      expect(await publicSermons()).toEqual([]);
      // Ever approved: archive first, then delete.
      expect(
        (await call('DELETE', `/v1/staff/sermons/${id}`, admin, 4)).json().error
          .code,
      ).toBe('ARCHIVE_FIRST');
      await act(admin, id, 'archive', 4);
      expect((await act(admin, id, 'submit', 5)).json().error.code).toBe(
        'ARCHIVED',
      );
      const restored = await act(admin, id, 'restore', 5);
      expect(restored.json().data).toMatchObject({
        archived: false,
        review: 'draft',
        live: null,
      });
      expect(await publicSermons()).toEqual([]);
      await act(admin, id, 'archive', 6);
      expect(
        (await call('DELETE', `/v1/staff/sermons/${id}`, admin, 7)).statusCode,
      ).toBe(204);

      // Archiving a live sermon takes it down at once.
      const other = await create(admin, { ...sermon, title: 'For the City' });
      await act(admin, other.id, 'submit', 1);
      await act(pastor, other.id, 'approve', 2);
      await act(admin, other.id, 'archive', 3);
      expect(await publicSermons()).toEqual([]);
      // A draft that was never approved can be deleted directly.
      const draft = await create(admin, { ...sermon, title: 'Draft only' });
      expect(
        (await call('DELETE', `/v1/staff/sermons/${draft.id}`, admin, 1))
          .statusCode,
      ).toBe(204);
    });

    it('the library cannot be used to publish a video around the Pastor', async () => {
      const admin = await as('ADMIN');
      for (const url of [
        'https://media.example.org/sermons/walking.mp4',
        'https://www.youtube.com/watch?v=abc',
        'https://vimeo.com/123',
      ]) {
        const response = await call(
          'POST',
          '/v1/staff/resources',
          admin,
          undefined,
          {
            title: 'Video',
            description: '',
            type: 'Video',
            url,
            folderId: null,
            visibility: 'members',
            status: 'published',
          },
        );
        expect(response.statusCode).toBe(422);
        expect(response.json().error.fieldErrors.url).toMatch(
          /Pastor approves/,
        );
      }
    });

    it('a sermon without a recording can be saved but never sent for approval or approved', async () => {
      const [admin, pastor] = [await as('ADMIN'), await as('PASTOR')];
      const { id } = await create(admin, { ...sermon, mediaUrl: '' });
      const submit = await act(admin, id, 'submit', 1);
      expect(submit.statusCode).toBe(409);
      expect(submit.json().error.code).toBe('RECORDING_REQUIRED');
      // Even a request left pending without a recording (for example from
      // an earlier seed) cannot be approved.
      await prisma.sermon.update({
        where: { id },
        data: { review: 'PENDING' },
      });
      const approve = await act(pastor, id, 'approve', 1);
      expect(approve.statusCode).toBe(409);
      expect(approve.json().error.code).toBe('RECORDING_REQUIRED');
      const row = await prisma.sermon.findUniqueOrThrow({ where: { id } });
      expect([row.version, row.liveVersion, row.approvedAt, row.live]).toEqual([
        1,
        null,
        null,
        null,
      ]);
      expect(
        await prisma.auditEvent.count({
          where: {
            entityId: id,
            action: {
              in: [
                'content.sermon_approved',
                'content.sermon_review_requested',
              ],
            },
          },
        }),
      ).toBe(0);
      expect(await publicSermons()).toEqual([]);
      // Adding a recording makes it ready.
      await call('PATCH', `/v1/staff/sermons/${id}`, admin, 1, sermon);
      expect((await act(admin, id, 'submit', 2)).statusCode).toBe(200);
    });
  },
);
