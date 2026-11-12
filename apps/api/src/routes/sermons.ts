import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  sermonInputSchema,
  sermonRejectSchema,
  type PublicSermon,
  type SermonInput,
  type SermonReviewState,
  type StaffSermon,
} from '@grace-abounds/validation';
import {
  prisma,
  Prisma,
  recordAudit,
  Role,
  type Sermon,
  type SermonReview,
} from '@grace-abounds/database';
import {
  AppError,
  notFound,
  parse,
  requireVersion,
  versionConflict,
} from '../lib/errors.js';
import { requireRole, type Actor } from '../lib/identity.js';

/*
 * Sermons & videos, with the Pastor-only publication boundary.
 *
 *   GET    /v1/staff/sermons                 Pastor, Admin
 *   POST   /v1/staff/sermons                 create a draft (never public)
 *   PATCH  /v1/staff/sermons/:id             save the working copy; never publishes
 *   POST   /v1/staff/sermons/:id/submit      ask the Pastor to approve this version
 *   POST   /v1/staff/sermons/:id/approve     Pastor only: publish this exact version
 *   POST   /v1/staff/sermons/:id/reject      Pastor only: send back with a note
 *   POST   /v1/staff/sermons/:id/unpublish   Pastor only: take the live version down
 *   POST   /v1/staff/sermons/:id/archive     take down and set aside
 *   POST   /v1/staff/sermons/:id/restore     back to a draft (needs approval again)
 *   DELETE /v1/staff/sermons/:id             only when nothing is or was live
 *
 * Every write needs If-Match and records a ContentRevision and an AuditEvent
 * in the same transaction. The public site and members only ever receive the
 * `live` copy the Pastor approved; a changed working copy waits for approval
 * while the approved version stays live.
 */

type Tx = Prisma.TransactionClient;
const ENTITY = 'sermons';

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
/** The public fields of the working copy. */
const working = (row: Sermon): SermonInput => ({
  title: row.title,
  series: row.series,
  speaker: row.speaker,
  date: dateOnly(row.date),
  duration: row.duration,
  image: row.image,
  summary: row.summary,
  mediaUrl: row.mediaUrl,
});
const fields = Object.keys(sermonInputSchema.shape) as (keyof SermonInput)[];
const sameContent = (a: SermonInput, b: SermonInput) =>
  fields.every((key) => a[key] === b[key]);
const liveOf = (row: Sermon) => row.live as SermonInput | null;
const review = (value: SermonReview) =>
  value.toLowerCase() as SermonReviewState;

function staffSermon(row: Sermon): StaffSermon {
  const live = liveOf(row);
  return {
    id: row.id,
    slug: row.slug,
    ...working(row),
    review: review(row.review),
    reviewNote: row.reviewNote,
    archived: !!row.archivedAt,
    live:
      live && row.liveVersion && row.approvedAt
        ? {
            version: row.liveVersion,
            approvedAt: row.approvedAt.toISOString(),
            title: live.title,
            mediaUrl: live.mediaUrl,
          }
        : null,
    changedSinceApproval: !!live && !sameContent(live, working(row)),
    everApproved: !!row.approvedAt,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '') || 'sermon';

const conflict = (code: string, message: string) =>
  new AppError(409, code, message);

/** A connected upload must be verified before anyone can approve it. */
async function assertMediaReady(tx: Tx, row: Sermon) {
  if (!row.mediaAssetId) return;
  const asset = await tx.asset.findUnique({ where: { id: row.mediaAssetId } });
  if (asset?.status !== 'VERIFIED')
    throw conflict(
      'MEDIA_NOT_READY',
      'The recording is still being checked. Try again when it is ready.',
    );
}

/** Approved sermons for the public bundle (also what members see). */
export async function publicSermons(): Promise<PublicSermon[]> {
  const rows = await prisma.sermon.findMany({
    where: { archivedAt: null, liveVersion: { not: null } },
  });
  return rows
    .flatMap((row) => {
      const live = liveOf(row);
      return live ? [{ id: row.id, slug: row.slug, ...live }] : [];
    })
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
    );
}

export function registerSermonRoutes(app: FastifyInstance) {
  const staff = (request: FastifyRequest) =>
    requireRole(request, Role.PASTOR, Role.ADMIN);
  const pastor = (request: FastifyRequest) => requireRole(request, Role.PASTOR);
  const done = (reply: FastifyReply, row: Sermon) => {
    reply.header('etag', `"${row.version}"`);
    reply.header('cache-control', 'private, no-store');
    return { data: staffSermon(row), version: row.version };
  };

  /**
   * Applies one change to a sermon at the version the editor saw, then
   * records the revision and audit event in the same transaction.
   */
  async function change(
    request: FastifyRequest<{ Params: { id: string } }>,
    actor: Actor,
    action: string,
    apply: (
      row: Sermon,
      tx: Tx,
    ) => Promise<Prisma.SermonUpdateManyMutationInput>,
    metadata: (
      before: Sermon,
      after: Sermon,
    ) => Record<string, unknown> = () => ({}),
  ) {
    const expected = requireVersion(request.headers['if-match']);
    return prisma.$transaction(async (tx) => {
      const existing = await tx.sermon.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) throw notFound('Sermon');
      if (existing.version !== expected) throw versionConflict();
      const data = await apply(existing, tx);
      const result = await tx.sermon.updateMany({
        where: { id: existing.id, version: expected },
        data: { ...data, version: { increment: 1 }, updatedById: actor.id },
      });
      if (result.count === 0) throw versionConflict();
      const saved = (await tx.sermon.findUnique({
        where: { id: existing.id },
      }))!;
      await tx.contentRevision.create({
        data: {
          entityType: ENTITY,
          entityKey: saved.id,
          version: saved.version,
          data: staffSermon(saved) as unknown as Prisma.InputJsonValue,
          actorId: actor.id,
        },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: `content.sermon_${action}`,
        entityType: 'sermon',
        entityId: saved.id,
        requestId: request.id,
        metadata: {
          version: saved.version,
          review: review(saved.review),
          previousReview: review(existing.review),
          ...metadata(existing, saved),
        },
      });
      return saved;
    });
  }

  app.get('/v1/staff/sermons', async (request, reply) => {
    staff(request);
    const rows = await prisma.sermon.findMany({
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    reply.header('cache-control', 'private, no-store');
    return { data: rows.map(staffSermon) };
  });

  app.post('/v1/staff/sermons', async (request, reply) => {
    const actor = staff(request);
    const input = parse(sermonInputSchema, request.body ?? {});
    const row = await prisma.$transaction(async (tx) => {
      const base = slugify(input.title);
      let slug = base;
      for (let n = 2; await tx.sermon.findUnique({ where: { slug } }); n++)
        slug = `${base}-${n}`;
      const created = await tx.sermon.create({
        data: {
          ...input,
          date: new Date(`${input.date}T00:00:00Z`),
          slug,
          updatedById: actor.id,
        },
      });
      await tx.contentRevision.create({
        data: {
          entityType: ENTITY,
          entityKey: created.id,
          version: 1,
          data: staffSermon(created) as unknown as Prisma.InputJsonValue,
          actorId: actor.id,
        },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'content.sermon_created',
        entityType: 'sermon',
        entityId: created.id,
        requestId: request.id,
        metadata: { slug },
      });
      return created;
    });
    reply.status(201);
    return done(reply, row);
  });

  app.patch<{ Params: { id: string } }>(
    '/v1/staff/sermons/:id',
    async (request, reply) => {
      const actor = staff(request);
      const input = parse(sermonInputSchema, request.body ?? {});
      const row = await change(request, actor, 'saved', async (row) => {
        const live = liveOf(row);
        const changed = !sameContent(working(row), input);
        // Saving never approves. A change withdraws a pending request or an
        // approval; going back to exactly the live content is approved again.
        let next = row.review;
        if (!row.archivedAt && live && sameContent(live, input))
          next = 'APPROVED';
        else if (changed && (next === 'PENDING' || next === 'APPROVED'))
          next = 'DRAFT';
        return {
          ...input,
          date: new Date(`${input.date}T00:00:00Z`),
          review: next,
        };
      });
      return done(reply, row);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/staff/sermons/:id/submit',
    async (request, reply) => {
      const actor = staff(request);
      const row = await change(
        request,
        actor,
        'review_requested',
        async (row, tx) => {
          if (row.archivedAt)
            throw conflict(
              'ARCHIVED',
              'Restore this sermon before asking for approval.',
            );
          if (row.review === 'PENDING')
            throw conflict(
              'ALREADY_PENDING',
              'This version is already waiting for the Pastor.',
            );
          const live = liveOf(row);
          if (live && sameContent(live, working(row)))
            throw conflict(
              'NOTHING_TO_REVIEW',
              'This version is already approved and live.',
            );
          await assertMediaReady(tx, row);
          return { review: 'PENDING', reviewNote: '' };
        },
      );
      return done(reply, row);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/staff/sermons/:id/approve',
    async (request, reply) => {
      const actor = pastor(request);
      const row = await change(
        request,
        actor,
        'approved',
        async (row, tx) => {
          if (row.review !== 'PENDING')
            throw conflict(
              'NOT_PENDING',
              'Only a version waiting for approval can be approved.',
            );
          await assertMediaReady(tx, row);
          const now = new Date();
          return {
            live: working(row) as unknown as Prisma.InputJsonValue,
            // The exact saved version the Pastor reviewed (its revision row).
            liveVersion: row.version,
            approvedById: actor.id,
            approvedAt: now,
            review: 'APPROVED',
            reviewNote: '',
            reviewedById: actor.id,
            reviewedAt: now,
          };
        },
        (before, after) => ({
          approvedVersion: after.liveVersion,
          mediaUrl: before.mediaUrl,
          replacedVersion: before.liveVersion,
        }),
      );
      return done(reply, row);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/staff/sermons/:id/reject',
    async (request, reply) => {
      const actor = pastor(request);
      const { note } = parse(sermonRejectSchema, request.body ?? {});
      const row = await change(request, actor, 'rejected', async (row) => {
        if (row.review !== 'PENDING')
          throw conflict(
            'NOT_PENDING',
            'Only a version waiting for approval can be sent back.',
          );
        return {
          review: 'REJECTED',
          reviewNote: note,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        };
      });
      return done(reply, row);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/staff/sermons/:id/unpublish',
    async (request, reply) => {
      const actor = pastor(request);
      const row = await change(
        request,
        actor,
        'unpublished',
        async (row) => {
          if (!row.live)
            throw conflict('NOT_LIVE', 'This sermon is not on the website.');
          return {
            live: Prisma.DbNull,
            liveVersion: null,
            review: row.review === 'APPROVED' ? 'DRAFT' : row.review,
          };
        },
        (before) => ({ unpublishedVersion: before.liveVersion }),
      );
      return done(reply, row);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/staff/sermons/:id/archive',
    async (request, reply) => {
      const actor = staff(request);
      const row = await change(
        request,
        actor,
        'archived',
        async (row) => {
          if (row.archivedAt)
            throw conflict('ARCHIVED', 'This sermon is already archived.');
          // Archiving takes it down; it never publishes anything.
          return {
            archivedAt: new Date(),
            live: Prisma.DbNull,
            liveVersion: null,
            review: 'DRAFT',
          };
        },
        (before) => ({ wasLive: !!before.live }),
      );
      return done(reply, row);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/staff/sermons/:id/restore',
    async (request, reply) => {
      const actor = staff(request);
      const row = await change(request, actor, 'restored', async (row) => {
        if (!row.archivedAt)
          throw conflict('NOT_ARCHIVED', 'This sermon is not archived.');
        return { archivedAt: null, review: 'DRAFT' };
      });
      return done(reply, row);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/staff/sermons/:id',
    async (request, reply) => {
      const actor = staff(request);
      const expected = requireVersion(request.headers['if-match']);
      await prisma.$transaction(async (tx) => {
        const existing = await tx.sermon.findUnique({
          where: { id: request.params.id },
        });
        if (!existing) throw notFound('Sermon');
        if (existing.version !== expected) throw versionConflict();
        if (existing.live || (existing.approvedAt && !existing.archivedAt))
          throw conflict(
            'ARCHIVE_FIRST',
            'Sermons that have been on the website are archived first.',
          );
        await tx.sermon.delete({ where: { id: existing.id } });
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'content.sermon_deleted',
          entityType: 'sermon',
          entityId: existing.id,
          requestId: request.id,
          metadata: {
            version: existing.version,
            record: staffSermon(existing),
          },
        });
      });
      reply.header('cache-control', 'private, no-store');
      return reply.status(204).send();
    },
  );
}
