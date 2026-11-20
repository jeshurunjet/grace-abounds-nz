import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  EXPORT_DAILY_LIMIT,
  EXPORT_LINK_SECONDS,
  notificationPreferencesSchema,
  type DataExportDownload,
  type DataExportItem,
  type DataExportStatus,
  type NotificationPreferences,
} from '@grace-abounds/validation';
import {
  prisma,
  Prisma,
  recordAudit,
  type DataExport,
} from '@grace-abounds/database';
import {
  AppError,
  notFound,
  parse,
  requireVersion,
  versionConflict,
} from '../lib/errors.js';
import {
  lockAndRecheck,
  requireActor,
  requireRecentAuth,
} from '../lib/identity.js';
import { requireStorage, stored } from '../lib/storage.js';

/*
 * Own-account settings (Phase 5A/5B). Every route is the signed-in person's
 * own data; there is no id for anyone else to guess.
 *
 *   GET  /v1/me/preferences          optional update email choices
 *   PUT  /v1/me/preferences          save them (If-Match version)
 *   GET  /v1/me/exports              my recent data export requests
 *   POST /v1/me/exports              request one (recent sign-in)
 *   POST /v1/me/exports/:id/download a short-lived download link (recent
 *                                    sign-in; my ready export only)
 *
 * In-app notifications are always kept and security emails always sent;
 * preferences control optional update emails only. A download link is a
 * bearer URL: it works for EXPORT_LINK_SECONDS once issued, even if the
 * session ends meanwhile, so each one is issued only after re-checking the
 * session, recent sign-in and an active account, and is audited.
 */

const noStore = (reply: FastifyReply) =>
  reply.header('cache-control', 'private, no-store');

function toPreferences(
  row: { emailCare: boolean; emailAccount: boolean; version: number } | null,
): NotificationPreferences {
  return row
    ? {
        emailCare: row.emailCare,
        emailAccount: row.emailAccount,
        version: row.version,
      }
    : { ...DEFAULT_NOTIFICATION_PREFERENCES, version: 1 };
}

function toExport(row: DataExport, now = new Date()): DataExportItem {
  // A ready export past its expiry is reported as expired straight away,
  // even before the cleanup job has removed its file.
  const status: DataExportStatus =
    row.status === 'READY' && row.expiresAt && row.expiresAt <= now
      ? 'expired'
      : (row.status.toLowerCase() as DataExportStatus);
  return {
    id: row.id,
    status,
    createdAt: row.createdAt.toISOString(),
    readyAt: row.readyAt?.toISOString() ?? '',
    expiresAt: row.expiresAt?.toISOString() ?? '',
    size: row.size ?? 0,
  };
}

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get('/v1/me/preferences', async (request, reply) => {
    const actor = requireActor(request);
    const row = await prisma.notificationPreference.findUnique({
      where: { userId: actor.id },
    });
    const data = toPreferences(row);
    noStore(reply);
    reply.header('etag', `"${data.version}"`);
    return { data, version: data.version };
  });

  app.put('/v1/me/preferences', async (request, reply) => {
    const actor = requireActor(request);
    const input = parse(notificationPreferencesSchema, request.body ?? {});
    const expected = requireVersion(request.headers['if-match']);
    try {
      const saved = await prisma.$transaction(async (tx) => {
        const row = await tx.notificationPreference.findUnique({
          where: { userId: actor.id },
        });
        // No saved choices yet counts as version 1 (the defaults).
        if ((row?.version ?? 1) !== expected) throw versionConflict();
        const next = row
          ? await tx.notificationPreference.updateMany({
              where: { userId: actor.id, version: expected },
              data: { ...input, version: { increment: 1 } },
            })
          : null;
        if (next && next.count === 0) throw versionConflict();
        const result = row
          ? await tx.notificationPreference.findUniqueOrThrow({
              where: { userId: actor.id },
            })
          : await tx.notificationPreference.create({
              data: { userId: actor.id, ...input, version: 2 },
            });
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'account.preferences_saved',
          entityType: 'User',
          entityId: actor.id,
          requestId: request.id,
          metadata: { ...input, version: result.version },
        });
        return result;
      });
      const data = toPreferences(saved);
      noStore(reply);
      reply.header('etag', `"${data.version}"`);
      return { data, version: data.version };
    } catch (error) {
      // Two first saves at once: one creates the row, the other is stale.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw versionConflict();
      throw error;
    }
  });

  app.get('/v1/me/exports', async (request, reply) => {
    const actor = requireActor(request);
    const rows = await prisma.dataExport.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    noStore(reply);
    return { data: rows.map((row) => toExport(row)) };
  });

  /**
   * Requests an export. Retry-safe: while one is queued, being built or
   * ready to download, asking again returns that one instead of another.
   */
  app.post('/v1/me/exports', async (request, reply) => {
    const actor = requireRecentAuth(request);
    requireStorage();
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      // Serialized with this account's sign-ins, revocations and requests.
      await lockAndRecheck(tx, actor, { requireRecent: true });
      const active = await tx.dataExport.findFirst({
        where: {
          userId: actor.id,
          OR: [
            { status: { in: ['QUEUED', 'BUILDING'] } },
            { status: 'READY', expiresAt: { gt: now } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (active) return { row: active, created: false };
      const recent = await tx.dataExport.count({
        where: {
          userId: actor.id,
          createdAt: { gt: new Date(now.getTime() - 86_400_000) },
        },
      });
      if (recent >= EXPORT_DAILY_LIMIT)
        throw new AppError(
          429,
          'EXPORT_LIMIT',
          `You can request up to ${EXPORT_DAILY_LIMIT} exports a day. Try again tomorrow.`,
        );
      const row = await tx.dataExport.create({ data: { userId: actor.id } });
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'account.export_requested',
        entityType: 'DataExport',
        entityId: row.id,
        requestId: request.id,
      });
      return { row, created: true };
    });
    noStore(reply);
    reply.status(result.created ? 202 : 200);
    return { data: toExport(result.row, now) };
  });

  app.post<{ Params: { id: string } }>(
    '/v1/me/exports/:id/download',
    async (request, reply) => {
      const actor = requireRecentAuth(request);
      const storage = requireStorage();
      const now = new Date();
      const row = await prisma.$transaction(async (tx) => {
        // The session must still be valid, recent and the account active.
        await lockAndRecheck(tx, actor, { requireRecent: true });
        const found = await tx.dataExport.findFirst({
          where: { id: request.params.id, userId: actor.id },
        });
        if (!found) throw notFound('Export');
        const expired =
          found.status === 'EXPIRED' ||
          (found.status === 'READY' &&
            (!found.expiresAt || found.expiresAt <= now));
        if (!expired && (found.status !== 'READY' || !found.storageKey))
          throw new AppError(
            409,
            'EXPORT_NOT_READY',
            'This export isn’t ready to download.',
          );
        if (expired)
          throw new AppError(
            410,
            'EXPORT_EXPIRED',
            'This export has expired. Request a new one.',
          );
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'account.export_downloaded',
          entityType: 'DataExport',
          entityId: found.id,
          requestId: request.id,
        });
        return found;
      });
      const day = row.createdAt.toISOString().slice(0, 10);
      const url = await stored(request.log, () =>
        storage.downloadUrl(row.storageKey!, {
          fileName: `grace-abounds-data-${day}.json`,
          contentType: 'application/json',
          disposition: 'attachment',
          expiresIn: EXPORT_LINK_SECONDS,
        }),
      );
      noStore(reply);
      return {
        data: {
          url,
          expiresAt: new Date(
            now.getTime() + EXPORT_LINK_SECONDS * 1000,
          ).toISOString(),
        } satisfies DataExportDownload,
      };
    },
  );
}
