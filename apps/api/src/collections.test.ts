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

const campus = {
  name: 'Grace North — Albany',
  kind: 'Campus',
  address: '1 Example Road, Albany',
  image: '',
  status: 'draft',
};
const person = {
  name: 'Ana Example',
  role: 'Youth Pastor',
  bio: '',
  image: '',
  status: 'published',
};

describe.skipIf(!dbTestsEnabled)(
  'editorial collections API (PostgreSQL)',
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
    const call = (method: string, url: string, headers = {}, body?: unknown) =>
      app.inject({
        method: method as never,
        url,
        headers,
        ...(body !== undefined && { payload: body as never }),
      });
    async function seedPages() {
      await prisma.siteSettings.create({
        data: { id: 'site', data: defaultSiteSettings },
      });
      for (const key of pageKeys)
        await prisma.pageContent.create({
          data: { key, data: defaultPages[key] },
        });
    }

    it('only staff can list or change collections; members read the library only', async () => {
      const member = await as('MEMBER');
      expect((await call('GET', '/v1/staff/team')).statusCode).toBe(401);
      expect(
        (await call('GET', '/v1/staff/team', member.headers)).statusCode,
      ).toBe(403);
      expect(
        (await call('POST', '/v1/staff/team', member.headers, person))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await call(
            'GET',
            '/v1/staff/not-a-thing',
            (await as('ADMIN')).headers,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (await call('GET', '/v1/member/library', member.headers)).statusCode,
      ).toBe(200);
      expect((await call('GET', '/v1/member/library')).statusCode).toBe(401);
    });

    it('create and save write a revision and an audit event; drafts stay out of public', async () => {
      await seedPages();
      const admin = await as('ADMIN');
      const created = await call(
        'POST',
        '/v1/staff/locations',
        admin.headers,
        campus,
      );
      expect(created.statusCode).toBe(201);
      const record = created.json().data;
      expect(record).toMatchObject({
        key: 'albany',
        version: 1,
        status: 'draft',
      });
      const bundle = async () =>
        (await call('GET', '/v1/public/content')).json().data.collections;
      expect((await bundle()).locations).toEqual([]);

      const pastor = await as('PASTOR');
      const saved = await call(
        'PATCH',
        `/v1/staff/locations/${record.id}`,
        { ...pastor.headers, 'if-match': '"1"' },
        { ...campus, name: '  Grace North — Albany ', status: 'published' },
      );
      expect(saved.statusCode).toBe(200);
      expect(saved.json().data).toMatchObject({
        name: 'Grace North — Albany',
        key: 'albany',
        version: 2,
      });
      const published = (await bundle()).locations;
      expect(published).toHaveLength(1);
      expect(published[0]).not.toHaveProperty('version');
      expect(published[0]).not.toHaveProperty('status');
      expect(
        await prisma.contentRevision.count({
          where: { entityType: 'locations', entityKey: record.id },
        }),
      ).toBe(2);
      expect(
        await prisma.auditEvent.findMany({
          where: { entityId: record.id },
          select: { action: true, actorId: true },
          orderBy: { createdAt: 'asc' },
        }),
      ).toEqual([
        { action: 'content.location_created', actorId: admin.user.id },
        { action: 'content.location_saved', actorId: pastor.user.id },
      ]);
    });

    it('rejects stale, missing-version and invalid saves without changing the record', async () => {
      const admin = await as('ADMIN');
      const { id } = (
        await call('POST', '/v1/staff/team', admin.headers, person)
      ).json().data;
      const stale = await call(
        'PATCH',
        `/v1/staff/team/${id}`,
        { ...admin.headers, 'if-match': '"9"' },
        { ...person, name: 'Stale' },
      );
      expect(stale.statusCode).toBe(412);
      expect(
        (await call('PATCH', `/v1/staff/team/${id}`, admin.headers, person))
          .statusCode,
      ).toBe(428);
      const invalid = await call(
        'PATCH',
        `/v1/staff/team/${id}`,
        { ...admin.headers, 'if-match': '"1"' },
        { ...person, image: 'http://insecure.example/photo.jpg' },
      );
      expect(invalid.statusCode).toBe(422);
      expect(invalid.json().error.fieldErrors.image).toBeTruthy();
      const row = await prisma.teamMember.findUniqueOrThrow({ where: { id } });
      expect([row.version, row.name, row.image]).toEqual([1, person.name, '']);
    });

    it('two editors saving the same version: one wins, the other gets a conflict', async () => {
      const [a, b] = [await as('ADMIN'), await as('PASTOR')];
      const { id } = (
        await call('POST', '/v1/staff/team', a.headers, person)
      ).json().data;
      const save = (who: typeof a, name: string) =>
        call(
          'PATCH',
          `/v1/staff/team/${id}`,
          { ...who.headers, 'if-match': '"1"' },
          { ...person, name },
        );
      const results = await Promise.all([save(a, 'From A'), save(b, 'From B')]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 412]);
      expect(
        await prisma.contentRevision.count({
          where: { entityType: 'team', entityKey: id },
        }),
      ).toBe(2);
    });

    it('order is saved explicitly and refused when the list changed', async () => {
      const admin = await as('ADMIN');
      const ids: string[] = [];
      for (const name of ['One', 'Two', 'Three'])
        ids.push(
          (
            await call('POST', '/v1/staff/team', admin.headers, {
              ...person,
              name,
            })
          ).json().data.id,
        );
      const reversed = [...ids].reverse();
      expect(
        (
          await call('PUT', '/v1/staff/team/order', admin.headers, {
            ids: reversed,
          })
        ).statusCode,
      ).toBe(200);
      const listed = (await call('GET', '/v1/staff/team', admin.headers)).json()
        .data;
      expect(listed.map((row: { id: string }) => row.id)).toEqual(reversed);
      const stale = await call('PUT', '/v1/staff/team/order', admin.headers, {
        ids: ids.slice(0, 2),
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe('ORDER_STALE');
    });

    it('published records are archived before deletion; used folders and published campuses are kept', async () => {
      const admin = await as('ADMIN');
      const { id } = (
        await call('POST', '/v1/staff/team', admin.headers, person)
      ).json().data;
      const blocked = await call('DELETE', `/v1/staff/team/${id}`, {
        ...admin.headers,
        'if-match': '"1"',
      });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error.code).toBe('ARCHIVE_FIRST');
      await call(
        'PATCH',
        `/v1/staff/team/${id}`,
        { ...admin.headers, 'if-match': '"1"' },
        { ...person, status: 'archived' },
      );
      expect(
        (
          await call('DELETE', `/v1/staff/team/${id}`, {
            ...admin.headers,
            'if-match': '"2"',
          })
        ).statusCode,
      ).toBe(204);
      expect(
        await prisma.auditEvent.count({
          where: { action: 'content.team_member_deleted', entityId: id },
        }),
      ).toBe(1);

      // A campus that was ever published stays (activities may refer to it).
      const loc = (
        await call('POST', '/v1/staff/locations', admin.headers, {
          ...campus,
          status: 'published',
        })
      ).json().data;
      await call(
        'PATCH',
        `/v1/staff/locations/${loc.id}`,
        { ...admin.headers, 'if-match': '"1"' },
        { ...campus, status: 'archived' },
      );
      const kept = await call('DELETE', `/v1/staff/locations/${loc.id}`, {
        ...admin.headers,
        'if-match': '"2"',
      });
      expect(kept.statusCode).toBe(409);
      expect(kept.json().error.code).toBe('IN_USE');

      // A folder with a resource in it cannot be deleted.
      const folder = (
        await call('POST', '/v1/staff/folders', admin.headers, {
          name: 'Study notes',
          parentId: null,
        })
      ).json().data;
      await call('POST', '/v1/staff/resources', admin.headers, {
        title: 'Romans study guide',
        description: '',
        type: 'PDF',
        url: 'https://example.org/romans.pdf',
        folderId: folder.id,
        visibility: 'members',
        status: 'draft',
      });
      const used = await call('DELETE', `/v1/staff/folders/${folder.id}`, {
        ...admin.headers,
        'if-match': '"1"',
      });
      expect(used.statusCode).toBe(409);
    });

    it('members see published library resources only', async () => {
      const admin = await as('ADMIN');
      const base = {
        description: '',
        type: 'PDF',
        url: 'https://example.org/file.pdf',
        folderId: null,
        visibility: 'members',
      };
      await call('POST', '/v1/staff/resources', admin.headers, {
        ...base,
        title: 'Published guide',
        status: 'published',
      });
      await call('POST', '/v1/staff/resources', admin.headers, {
        ...base,
        title: 'Draft guide',
        status: 'draft',
      });
      const member = await as('MEMBER');
      const library = (
        await call('GET', '/v1/member/library', member.headers)
      ).json().data;
      expect(library.resources.map((r: { title: string }) => r.title)).toEqual([
        'Published guide',
      ]);
      expect(library.resources[0]).not.toHaveProperty('status');
      const missingFolder = await call(
        'POST',
        '/v1/staff/resources',
        admin.headers,
        { ...base, title: 'Lost', folderId: 'missing', status: 'draft' },
      );
      expect(missingFolder.statusCode).toBe(422);
    });
  },
);
