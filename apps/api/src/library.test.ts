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
 * Codex Phase 2B review regressions:
 * - [P1] the library fails closed: a link to another website is published by
 *   the Pastor only, whatever its spelling or type label; sermons reach the
 *   library only by reference, and only while approved and live.
 * - [P2] deletes are conditional on the version and state the editor saw.
 */

const recording = 'https://media.example.org/sermons/walking.mp4';
const sermon = {
  title: 'Walking in the Spirit',
  series: '',
  speaker: 'Pastor Example',
  date: '2026-10-04',
  duration: '42 min',
  image: '',
  summary: '',
  mediaUrl: recording,
};
const resource = {
  title: 'Guide',
  description: '',
  type: 'PDF',
  url: '',
  folderId: null,
  visibility: 'members',
  status: 'published',
};

describe.skipIf(!dbTestsEnabled)(
  'library policy and safe deletes (PostgreSQL)',
  () => {
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
    const library = async (who: Who) =>
      (await call('GET', '/v1/member/library', who)).json().data.resources as {
        title: string;
        href: string;
      }[];
    const librarySermons = async (who: Who) =>
      (
        (await call('GET', '/v1/member/library', who)).json().data.sermons as {
          href: string;
        }[]
      ).map((item) => item.href);
    async function liveSermon(admin: Who, pastor: Who, title = sermon.title) {
      const { id } = (
        await call('POST', '/v1/staff/sermons', admin, undefined, {
          ...sermon,
          title,
        })
      ).json().data;
      await call('POST', `/v1/staff/sermons/${id}/submit`, admin, 1);
      expect(
        (await call('POST', `/v1/staff/sermons/${id}/approve`, pastor, 2))
          .statusCode,
      ).toBe(200);
      return id as string;
    }

    it('Admin cannot publish any outside link, whatever it looks like or is labelled', async () => {
      const [admin, member] = [await as('ADMIN'), await as('MEMBER')];
      for (const [url, type] of [
        ['https://example.org/watch', 'Video'],
        ['https://example.org/watch', 'Document'],
        ['https://example.org/go?to=somewhere', 'PDF'],
        ['https://example.org/files/notes.pdf', 'PDF'],
        ['https://short.example/abc123', 'Link'],
      ]) {
        const response = await call(
          'POST',
          '/v1/staff/resources',
          admin,
          undefined,
          {
            ...resource,
            url,
            type,
          },
        );
        expect(response.statusCode).toBe(403);
        expect(response.json().error.code).toBe('PASTOR_REVIEW_REQUIRED');
        expect(response.json().error.fieldErrors.status).toBeTruthy();
      }
      expect(await prisma.resource.count()).toBe(0);
      expect(await library(member)).toEqual([]);

      // A draft is fine; publishing it later is still refused for Admin.
      const draft = await call(
        'POST',
        '/v1/staff/resources',
        admin,
        undefined,
        {
          ...resource,
          url: 'https://example.org/watch',
          status: 'draft',
        },
      );
      expect(draft.statusCode).toBe(201);
      const { id } = draft.json().data;
      const publish = await call(
        'PATCH',
        `/v1/staff/resources/${id}`,
        admin,
        1,
        {
          ...resource,
          url: 'https://example.org/watch',
        },
      );
      expect(publish.statusCode).toBe(403);
      expect(await library(member)).toEqual([]);
    });

    it('a link a browser would send off-site is refused for everyone, not treated as a site path', async () => {
      const [admin, pastor, member] = [
        await as('ADMIN'),
        await as('PASTOR'),
        await as('MEMBER'),
      ];
      for (const who of [admin, pastor])
        for (const url of [
          '/\\video.example/watch',
          '/\\\\video.example',
          '//video.example',
        ])
          for (const status of ['published', 'draft']) {
            const response = await call(
              'POST',
              '/v1/staff/resources',
              who,
              undefined,
              {
                ...resource,
                url,
                status,
              },
            );
            expect(response.statusCode, `${url} ${status}`).toBe(422);
            expect(response.json().error.fieldErrors.url).toBeTruthy();
          }
      expect(await prisma.resource.count()).toBe(0);
      expect(await library(member)).toEqual([]);
      const step = await call(
        'POST',
        '/v1/staff/next-steps',
        admin,
        undefined,
        {
          title: 'Serve',
          subtitle: '',
          heading: '',
          body: '',
          icon: '',
          cta: { kind: 'link', label: 'Go', target: '/\\video.example/watch' },
          path: [],
          status: 'published',
        },
      );
      expect(step.statusCode).toBe(422);
      // Normal links keep working.
      expect(
        (
          await call('POST', '/v1/staff/resources', admin, undefined, {
            ...resource,
            url: '/next-steps',
          })
        ).statusCode,
      ).toBe(201);
      expect(
        (
          await call('POST', '/v1/staff/resources', pastor, undefined, {
            ...resource,
            url: 'https://example.org/files/notes.pdf',
          })
        ).statusCode,
      ).toBe(201);
    });

    it('the Pastor publishes an outside link; Admin may then edit its text but not swap the link', async () => {
      const [admin, pastor, member] = [
        await as('ADMIN'),
        await as('PASTOR'),
        await as('MEMBER'),
      ];
      const created = await call(
        'POST',
        '/v1/staff/resources',
        pastor,
        undefined,
        {
          ...resource,
          url: 'https://example.org/files/notes.pdf',
        },
      );
      expect(created.statusCode).toBe(201);
      const { id } = created.json().data;
      expect((await library(member)).map((r) => r.href)).toEqual([
        'https://example.org/files/notes.pdf',
      ]);
      const retitled = await call(
        'PATCH',
        `/v1/staff/resources/${id}`,
        admin,
        1,
        {
          ...resource,
          title: 'Study notes',
          url: 'https://example.org/files/notes.pdf',
        },
      );
      expect(retitled.statusCode).toBe(200);
      const swapped = await call(
        'PATCH',
        `/v1/staff/resources/${id}`,
        admin,
        2,
        {
          ...resource,
          title: 'Study notes',
          url: 'https://example.org/watch',
        },
      );
      expect(swapped.statusCode).toBe(403);
      expect((await library(member)).map((r) => r.href)).toEqual([
        'https://example.org/files/notes.pdf',
      ]);
      // Site paths stay open to both staff roles.
      expect(
        (
          await call('POST', '/v1/staff/resources', admin, undefined, {
            ...resource,
            title: 'Next steps',
            url: '/next-steps',
          })
        ).statusCode,
      ).toBe(201);
    });

    it('a sermon reaches the library only by reference, and only while approved and live', async () => {
      const [admin, pastor, member] = [
        await as('ADMIN'),
        await as('PASTOR'),
        await as('MEMBER'),
      ];
      // A sermon that has not been approved: the reference is saved but hidden.
      const { id: draftId } = (
        await call('POST', '/v1/staff/sermons', admin, undefined, {
          ...sermon,
          title: 'Not approved yet',
        })
      ).json().data;
      const hidden = await call(
        'POST',
        '/v1/staff/resources',
        admin,
        undefined,
        {
          ...resource,
          title: 'Unapproved sermon',
          type: 'Video',
          sermonId: draftId,
        },
      );
      expect(hidden.statusCode).toBe(201);
      expect(await library(member)).toEqual([]);
      expect(await librarySermons(member)).toEqual([]);

      const liveId = await liveSermon(admin, pastor);
      await call('POST', '/v1/staff/resources', admin, undefined, {
        ...resource,
        title: 'Approved sermon',
        type: 'Video',
        sermonId: liveId,
      });
      expect(await library(member)).toEqual([
        expect.objectContaining({
          title: 'Approved sermon',
          href: '/sermons/walking-in-the-spirit',
        }),
      ]);
      // Every approved sermon is also listed automatically.
      expect(await librarySermons(member)).toEqual([
        '/sermons/walking-in-the-spirit',
      ]);
      // Unpublishing the sermon removes it from the library too.
      await call('POST', `/v1/staff/sermons/${liveId}/unpublish`, pastor, 3);
      expect(await library(member)).toEqual([]);
      expect(await librarySermons(member)).toEqual([]);

      // A sermon listed in the library cannot be deleted from under it.
      const used = await call(
        'DELETE',
        `/v1/staff/sermons/${draftId}`,
        admin,
        1,
      );
      expect(used.json().error.code).toBe('IN_USE');
      // A reference and a link together, or a missing sermon, are refused.
      for (const body of [
        { ...resource, url: '/next-steps', sermonId: liveId },
        { ...resource, sermonId: 'missing' },
      ])
        expect(
          (await call('POST', '/v1/staff/resources', admin, undefined, body))
            .statusCode,
        ).toBe(422);
    });

    it('a delete never removes a record that was saved or published meanwhile', async () => {
      const admin = await as('ADMIN');
      for (let round = 0; round < 5; round++) {
        const { id } = (
          await call('POST', '/v1/staff/team', admin, undefined, {
            name: `Person ${round}`,
            role: '',
            bio: '',
            image: '',
            status: 'draft',
          })
        ).json().data;
        const [save, remove] = await Promise.all([
          call('PATCH', `/v1/staff/team/${id}`, admin, 1, {
            name: `Person ${round}`,
            role: '',
            bio: '',
            image: '',
            status: 'published',
          }),
          call('DELETE', `/v1/staff/team/${id}`, admin, 1),
        ]);
        const row = await prisma.teamMember.findUnique({ where: { id } });
        const deletions = await prisma.auditEvent.count({
          where: { action: 'content.team_member_deleted', entityId: id },
        });
        if (remove.statusCode === 204) {
          // The delete went first; the save then found nothing to change.
          expect([404, 412]).toContain(save.statusCode);
          expect([row, deletions]).toEqual([null, 1]);
        } else {
          expect(save.statusCode).toBe(200);
          expect(remove.statusCode).toBe(412);
          expect([row?.status, deletions]).toEqual(['PUBLISHED', 0]);
        }
      }
      // And sequentially: a delete with the version from before a publish.
      const { id } = (
        await call('POST', '/v1/staff/team', admin, undefined, {
          name: 'Sequential',
          role: '',
          bio: '',
          image: '',
          status: 'draft',
        })
      ).json().data;
      await call('PATCH', `/v1/staff/team/${id}`, admin, 1, {
        name: 'Sequential',
        role: '',
        bio: '',
        image: '',
        status: 'published',
      });
      expect(
        (await call('DELETE', `/v1/staff/team/${id}`, admin, 1)).statusCode,
      ).toBe(412);
      expect(await prisma.teamMember.count({ where: { id } })).toBe(1);
    });

    it('a pending sermon deleted while the Pastor approves it is never both live and deleted', async () => {
      const [admin, pastor] = [await as('ADMIN'), await as('PASTOR')];
      for (let round = 0; round < 5; round++) {
        const { id } = (
          await call('POST', '/v1/staff/sermons', admin, undefined, {
            ...sermon,
            title: `Race ${round}`,
          })
        ).json().data;
        await call('POST', `/v1/staff/sermons/${id}/submit`, admin, 1);
        const [approve, remove] = await Promise.all([
          call('POST', `/v1/staff/sermons/${id}/approve`, pastor, 2),
          call('DELETE', `/v1/staff/sermons/${id}`, admin, 2),
        ]);
        const row = await prisma.sermon.findUnique({ where: { id } });
        const audit = async (action: string) =>
          prisma.auditEvent.count({ where: { action, entityId: id } });
        if (remove.statusCode === 204) {
          expect([404, 412]).toContain(approve.statusCode);
          expect(row).toBeNull();
          expect(await audit('content.sermon_approved')).toBe(0);
        } else {
          expect(approve.statusCode).toBe(200);
          expect(remove.statusCode).toBe(412);
          expect(row?.liveVersion).toBe(2);
          expect(await audit('content.sermon_deleted')).toBe(0);
        }
      }
    });
  },
);
