import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import {
  isPageKey,
  pageKeys,
  pageSchemas,
  siteSettingsSchema,
  type PageKey,
} from '@grace-abounds/validation';
import {
  prisma,
  recordAudit,
  Role,
  type Prisma,
} from '@grace-abounds/database';
import {
  AppError,
  notFound,
  parse,
  requireVersion,
  versionConflict,
} from '../lib/errors.js';
import { requireRole } from '../lib/identity.js';

const unavailable = () =>
  new AppError(
    503,
    'CONTENT_UNAVAILABLE',
    'Website content has not been set up yet.',
  );
const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Page headings (each page's `hero`: eyebrow, title, accent, copy) are fixed
 * presentation copy. Owner decision, 12 Nov 2026: no staff role edits them
 * through the CMS; changing them is source/release work. Full-document saves
 * may carry the stored values unchanged; any change is refused.
 */
const HERO_FIELDS = ['eyebrow', 'title', 'accent', 'copy'] as const;
function changedHeroFields(stored: unknown, incoming: unknown): string[] {
  const hero = (value: unknown) =>
    ((value as { hero?: Record<string, unknown> } | null)?.hero ??
      {}) as Record<string, unknown>;
  const text = (value: unknown) => String(value ?? '').trim();
  const before = hero(stored);
  const after = hero(incoming);
  return HERO_FIELDS.filter(
    (field) => text(before[field]) !== text(after[field]),
  ).map((field) => `hero.${field}`);
}
const fixedHeading = (fields: string[]) =>
  new AppError(
    422,
    'FIXED_CONTENT',
    'Page headings are fixed and can’t be changed here.',
    Object.fromEntries(
      fields.map((field) => [field, 'Page headings are fixed.']),
    ),
  );

function withVersion(reply: FastifyReply, version: number) {
  reply.header('etag', `"${version}"`);
  reply.header('cache-control', 'private, no-store');
}

/**
 * Website content: shared settings and the seven page sections.
 * Public routes return published content only (no editor metadata). Staff
 * routes (Pastor/Admin) replace one resource at a time with If-Match;
 * saving publishes immediately and records a revision and an audit event.
 */
export function registerContentRoutes(app: FastifyInstance) {
  // ---------- Public ----------
  app.get('/v1/public/content', async (_request, reply) => {
    const [site, pages] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { id: 'site' },
        select: { data: true },
      }),
      prisma.pageContent.findMany({
        where: { key: { in: pageKeys } },
        select: { key: true, data: true },
      }),
    ]);
    if (!site || pages.length !== pageKeys.length) throw unavailable();
    reply.header('cache-control', 'no-store');
    return {
      data: {
        site: site.data,
        pages: Object.fromEntries(pages.map((page) => [page.key, page.data])),
      },
    };
  });

  app.get('/v1/public/site', async (_request, reply) => {
    const site = await prisma.siteSettings.findUnique({
      where: { id: 'site' },
      select: { data: true },
    });
    if (!site) throw unavailable();
    reply.header('cache-control', 'no-store');
    return { data: site.data };
  });

  app.get<{ Params: { pageKey: string } }>(
    '/v1/public/pages/:pageKey',
    async (request, reply) => {
      if (!isPageKey(request.params.pageKey)) throw notFound('Page');
      const page = await prisma.pageContent.findUnique({
        where: { key: request.params.pageKey },
        select: { data: true },
      });
      if (!page) throw notFound('Page');
      reply.header('cache-control', 'no-store');
      return { data: page.data };
    },
  );

  // ---------- Staff ----------
  const requireStaff = (request: Parameters<typeof requireRole>[0]) =>
    requireRole(request, Role.PASTOR, Role.ADMIN);

  app.get('/v1/staff/site', async (request, reply) => {
    requireStaff(request);
    const site = await prisma.siteSettings.findUnique({
      where: { id: 'site' },
    });
    if (!site) throw unavailable();
    withVersion(reply, site.version);
    return {
      data: site.data,
      version: site.version,
      updatedAt: site.updatedAt,
    };
  });

  app.patch('/v1/staff/site', async (request, reply) => {
    const actor = requireStaff(request);
    const expected = requireVersion(request.headers['if-match']);
    const data = parse(siteSettingsSchema, request.body ?? {});
    const saved = await prisma.$transaction(async (tx) => {
      const result = await tx.siteSettings.updateMany({
        where: { id: 'site', version: expected },
        data: {
          data: json(data),
          version: { increment: 1 },
          updatedById: actor.id,
        },
      });
      if (result.count === 0) {
        if (!(await tx.siteSettings.findUnique({ where: { id: 'site' } })))
          throw unavailable();
        throw versionConflict();
      }
      const version = expected + 1;
      await tx.contentRevision.create({
        data: {
          entityType: 'site',
          entityKey: 'site',
          version,
          data: json(data),
          actorId: actor.id,
        },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'content.site_published',
        entityType: 'SiteSettings',
        entityId: 'site',
        requestId: request.id,
        metadata: { version },
      });
      return { version };
    });
    withVersion(reply, saved.version);
    return { data, version: saved.version };
  });

  app.get<{ Params: { pageKey: string } }>(
    '/v1/staff/pages/:pageKey',
    async (request, reply) => {
      requireStaff(request);
      if (!isPageKey(request.params.pageKey)) throw notFound('Page');
      const page = await prisma.pageContent.findUnique({
        where: { key: request.params.pageKey },
      });
      if (!page) throw unavailable();
      withVersion(reply, page.version);
      return {
        data: page.data,
        version: page.version,
        updatedAt: page.updatedAt,
      };
    },
  );

  app.patch<{ Params: { pageKey: string } }>(
    '/v1/staff/pages/:pageKey',
    async (request, reply) => {
      const actor = requireStaff(request);
      if (!isPageKey(request.params.pageKey)) throw notFound('Page');
      const key: PageKey = request.params.pageKey;
      const expected = requireVersion(request.headers['if-match']);
      const schema: ZodType<unknown> = pageSchemas[key];
      const data = parse(schema, request.body ?? {});
      const saved = await prisma.$transaction(async (tx) => {
        const current = await tx.pageContent.findUnique({ where: { key } });
        if (!current) throw unavailable();
        if (current.version !== expected) throw versionConflict();
        const changed = changedHeroFields(current.data, data);
        if (changed.length) throw fixedHeading(changed);
        const result = await tx.pageContent.updateMany({
          where: { key, version: expected },
          data: {
            data: json(data),
            version: { increment: 1 },
            updatedById: actor.id,
          },
        });
        if (result.count === 0) {
          if (!(await tx.pageContent.findUnique({ where: { key } })))
            throw unavailable();
          throw versionConflict();
        }
        const version = expected + 1;
        await tx.contentRevision.create({
          data: {
            entityType: 'page',
            entityKey: key,
            version,
            data: json(data),
            actorId: actor.id,
          },
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'content.page_published',
          entityType: 'PageContent',
          entityId: key,
          requestId: request.id,
          metadata: { version },
        });
        return { version };
      });
      withVersion(reply, saved.version);
      return { data, version: saved.version };
    },
  );
}
