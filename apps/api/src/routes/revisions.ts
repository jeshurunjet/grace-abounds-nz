import type { FastifyInstance } from 'fastify';
import { isPageKey } from '@grace-abounds/validation';
import { prisma, Role } from '@grace-abounds/database';
import { notFound, requireVersion } from '../lib/errors.js';
import { requireRole } from '../lib/identity.js';
import {
  isCollectionName,
  restoredInput,
  saveCollectionRecord,
} from './collections.js';
import { savePage, saveSite, withCurrentHeading } from './content.js';
import { restoreSermonVersion } from './sermons.js';
import { restoreActivityVersion } from './activities.js';

/*
 * Phase 2C: revision history and versioned, audited restore (staff only).
 *
 *   GET  /v1/staff/revisions?entityType=…&entityKey=…   newest first
 *   POST /v1/staff/revisions/:id/restore                 If-Match: current
 *
 * A restore never rewrites history: it saves the old content as a NEW
 * version through the same path as an ordinary save (validation with
 * today's rules, If-Match, revision with restoredFromId, audit event,
 * content-change outbox event). Boundaries kept on purpose:
 * - page headings stay as they are now (fixed content);
 * - a record keeps today's status and who-can-open, so a restore never
 *   publishes a draft or widens access, and outside links still need the
 *   Pastor;
 * - a sermon restore changes only the working copy: what is live stays as
 *   the Pastor approved it, and the restored version needs approval.
 */

const LIMIT = 50;

function entityKind(entityType: string, entityKey: string) {
  if (entityType === 'site' && entityKey === 'site') return 'site';
  if (entityType === 'page' && isPageKey(entityKey)) return 'page';
  if (entityType === 'sermons') return 'sermon';
  if (entityType === 'activities') return 'activity';
  if (isCollectionName(entityType)) return 'collection';
  return null;
}

export function registerRevisionRoutes(app: FastifyInstance) {
  const staff = (request: Parameters<typeof requireRole>[0]) =>
    requireRole(request, Role.PASTOR, Role.ADMIN);

  app.get<{ Querystring: { entityType?: string; entityKey?: string } }>(
    '/v1/staff/revisions',
    async (request, reply) => {
      staff(request);
      const { entityType = '', entityKey = '' } = request.query;
      if (!entityKind(entityType, entityKey)) throw notFound('History');
      const rows = await prisma.contentRevision.findMany({
        where: { entityType, entityKey },
        orderBy: { version: 'desc' },
        take: LIMIT,
        include: { actor: { select: { name: true, email: true } } },
      });
      const sources = await prisma.contentRevision.findMany({
        where: {
          id: {
            in: rows
              .map((row) => row.restoredFromId)
              .filter((id): id is string => !!id),
          },
        },
        select: { id: true, version: true },
      });
      const versionOf = new Map(sources.map((row) => [row.id, row.version]));
      reply.header('cache-control', 'private, no-store');
      return {
        data: rows.map((row) => ({
          id: row.id,
          version: row.version,
          createdAt: row.createdAt.toISOString(),
          by: row.actor ? row.actor.name || row.actor.email : null,
          restoredFromVersion: row.restoredFromId
            ? (versionOf.get(row.restoredFromId) ?? null)
            : null,
          data: row.data,
        })),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/staff/revisions/:id/restore',
    async (request, reply) => {
      const actor = staff(request);
      const expected = requireVersion(request.headers['if-match']);
      const revision = await prisma.contentRevision.findUnique({
        where: { id: request.params.id },
      });
      if (!revision) throw notFound('Version');
      const kind = entityKind(revision.entityType, revision.entityKey);
      if (!kind) throw notFound('Version');
      const from = { id: revision.id, version: revision.version };
      reply.header('cache-control', 'private, no-store');
      if (kind === 'site') {
        const saved = await saveSite(
          { expected, requestId: request.id },
          actor,
          () => revision.data,
          from,
        );
        reply.header('etag', `"${saved.version}"`);
        return saved;
      }
      if (kind === 'page') {
        if (!isPageKey(revision.entityKey)) throw notFound('Version');
        const saved = await savePage(
          { key: revision.entityKey, expected, requestId: request.id },
          actor,
          withCurrentHeading(revision.data),
          from,
        );
        reply.header('etag', `"${saved.version}"`);
        return saved;
      }
      if (kind === 'activity') {
        const row = await restoreActivityVersion(
          { id: revision.entityKey, expected, requestId: request.id },
          { ...from, data: revision.data },
          actor,
        );
        reply.header('etag', `"${row.version}"`);
        return { version: row.version };
      }
      if (kind === 'sermon') {
        const row = await restoreSermonVersion(
          { id: revision.entityKey, expected, requestId: request.id },
          { ...from, data: revision.data },
          actor,
        );
        reply.header('etag', `"${row.version}"`);
        return { version: row.version };
      }
      const { row } = await saveCollectionRecord(
        {
          name: revision.entityType,
          id: revision.entityKey,
          expected,
          requestId: request.id,
        },
        actor,
        restoredInput(revision.data),
        from,
      );
      reply.header('etag', `"${row.version}"`);
      return { version: row.version };
    },
  );
}
