import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  activityExceptionInputSchema,
  activityInputSchema,
  DAYLIGHT_SAVING_MESSAGE,
  inDaylightSavingHour,
  isRealDate,
  nzLocalToUtc,
  nzNow,
  scheduleDates,
  type Activity,
  type ActivityException,
  type ActivityInput,
  type StaffActivities,
  type StaffActivity,
} from '@grace-abounds/validation';
import {
  prisma,
  Prisma,
  recordAudit,
  Role,
  type Activity as ActivityRow,
  type ActivityException as ExceptionRow,
} from '@grace-abounds/database';
import {
  AppError,
  notFound,
  parse,
  requireVersion,
  versionConflict,
} from '../lib/errors.js';
import { requireRole, type Actor } from '../lib/identity.js';
import { recordContentChange } from '../lib/content-change.js';
import { parseRestored } from '../lib/restore.js';

/*
 * Activities and calendar (Phase 3A). Staff (Pastor, Admin) only:
 *
 *   GET    /v1/staff/activities                       every activity + dates
 *   POST   /v1/staff/activities                       create (explicit Save)
 *   PATCH  /v1/staff/activities/:id                   save   (If-Match)
 *   DELETE /v1/staff/activities/:id                   draft/archived only
 *   PUT    /v1/staff/activities/:id/exceptions/:date  change/cancel one date
 *   DELETE /v1/staff/activities/:id/exceptions/:date  back to the usual
 *
 * Every write checks the version the editor saw, records a content revision
 * and an audit event, and enqueues the content-change outbox event in the
 * same transaction. Members and the public receive only published, live
 * activities, through the public content bundle (publicActivities below).
 * One occurrence is identified by the activity and its original local date;
 * changing or cancelling that date never changes its identity.
 */

type Tx = Prisma.TransactionClient;
const ENTITY = 'activities';

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T00:00:00Z`);

/** A database row in the shape every activity screen reads. */
export function toActivity(row: ActivityRow, now = new Date()): Activity {
  const pending =
    row.status === 'PUBLISHED' && !!row.publishAt && row.publishAt > now;
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind as Activity['kind'],
    title: row.title,
    summary: row.summary,
    leader: row.leader,
    tag: row.tag,
    locationId: row.locationKey,
    venue: row.venue,
    image: row.image,
    schedule: {
      repeat: row.repeat as Activity['schedule']['repeat'],
      date: dateOnly(row.startDate),
      until: row.untilDate ? dateOnly(row.untilDate) : '',
      days: [...row.days],
      monthWeek: row.monthWeek,
      monthDay: row.monthDay,
      startTime: row.startTime,
      endTime: row.endTime,
    },
    joinMode: row.joinMode as Activity['joinMode'],
    capacity: row.capacity,
    status: pending
      ? 'scheduled'
      : (row.status.toLowerCase() as Activity['status']),
    publishAt: row.publishAt ? nzNow(row.publishAt).stamp : '',
  };
}
const toException = (row: ExceptionRow): ActivityException => ({
  id: row.id,
  activityId: row.activityId,
  date: dateOnly(row.date),
  kind: row.kind as ActivityException['kind'],
  note: row.note,
  startTime: row.startTime,
  endTime: row.endTime,
  venue: row.venue,
});
const staffActivity = (row: ActivityRow): StaffActivity => ({
  ...toActivity(row),
  version: row.version,
  updatedAt: row.updatedAt.toISOString(),
});

/** Published activities that are live now, with their changed dates. */
export async function publicActivities(now = new Date()) {
  const rows = await prisma.activity.findMany({
    where: {
      status: 'PUBLISHED',
      OR: [{ publishAt: null }, { publishAt: { lte: now } }],
    },
    include: { exceptions: true },
    orderBy: [{ startDate: 'asc' }, { title: 'asc' }],
  });
  return {
    activities: rows.map((row) => toActivity(row, now)),
    activityExceptions: rows.flatMap((row) => row.exceptions.map(toException)),
  };
}

const invalid = (fieldErrors: Record<string, string>) =>
  new AppError(
    422,
    'VALIDATION_FAILED',
    'Some fields need attention.',
    fieldErrors,
  );

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '') || 'activity';

/** Database fields from validated input. */
async function toData(tx: Tx, input: ActivityInput) {
  if (
    input.locationId &&
    !(await tx.location.findUnique({ where: { key: input.locationId } }))
  )
    throw invalid({ locationId: 'That campus no longer exists.' });
  const { schedule } = input;
  const [publishDate = '', publishTime = ''] = input.publishAt.split('T');
  return {
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    leader: input.leader,
    tag: input.tag,
    locationKey: input.locationId,
    venue: input.venue,
    image: input.image,
    repeat: schedule.repeat,
    startDate: asDate(schedule.date),
    untilDate:
      schedule.repeat !== 'once' && schedule.until
        ? asDate(schedule.until)
        : null,
    days: [...new Set(schedule.days)].sort(),
    monthWeek: schedule.monthWeek,
    monthDay: schedule.monthDay,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    joinMode: input.joinMode,
    capacity: input.joinMode === 'none' ? null : input.capacity,
    status: input.status.toUpperCase() as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    publishAt: input.publishAt ? nzLocalToUtc(publishDate, publishTime) : null,
  };
}

/** Revision snapshot: the activity and its changed dates. */
async function snapshot(tx: Tx, row: ActivityRow) {
  const exceptions = await tx.activityException.findMany({
    where: { activityId: row.id },
    orderBy: { date: 'asc' },
  });
  return {
    ...toActivity(row),
    exceptions: exceptions.map(toException),
  } as unknown as Prisma.InputJsonValue;
}

/** Records the revision, audit event and content change for a saved row. */
async function recordSave(
  tx: Tx,
  row: ActivityRow,
  actor: Actor,
  action: string,
  requestId: string,
  metadata: Record<string, unknown> = {},
  restoredFromId?: string,
) {
  await tx.contentRevision.create({
    data: {
      entityType: ENTITY,
      entityKey: row.id,
      version: row.version,
      data: await snapshot(tx, row),
      actorId: actor.id,
      restoredFromId: restoredFromId ?? null,
    },
  });
  await recordAudit(tx, {
    actorId: actor.id,
    action: `content.activity_${action}`,
    entityType: 'activity',
    entityId: row.id,
    requestId,
    metadata: { version: row.version, ...metadata },
  });
  await recordContentChange(tx, ENTITY, row.id, row.version);
}

/**
 * Saves an activity at the version the editor saw (create when no id).
 * Also used by revision restore, which passes the revision it came from.
 */
export async function saveActivity(
  target: { id?: string; expected?: number; requestId: string },
  actor: Actor,
  input: (existing: ActivityRow | null) => ActivityInput,
  restoredFrom?: { id: string; version: number },
) {
  return prisma.$transaction(async (tx) => {
    if (!target.id) {
      const values = input(null);
      const data = await toData(tx, values);
      const base = slugify(values.title);
      let slug = base;
      for (let n = 2; await tx.activity.findUnique({ where: { slug } }); n++)
        slug = `${base}-${n}`;
      const created = await tx.activity.create({
        data: { ...data, slug, updatedById: actor.id },
      });
      await recordSave(tx, created, actor, 'created', target.requestId, {
        slug,
      });
      return created;
    }
    const existing = await tx.activity.findUnique({ where: { id: target.id } });
    if (!existing) throw notFound('Activity');
    if (existing.version !== target.expected) throw versionConflict();
    const data = await toData(tx, input(existing));
    const result = await tx.activity.updateMany({
      where: { id: existing.id, version: target.expected },
      data: { ...data, version: { increment: 1 }, updatedById: actor.id },
    });
    if (result.count === 0) throw versionConflict();
    const saved = (await tx.activity.findUnique({
      where: { id: existing.id },
    }))!;
    await recordSave(
      tx,
      saved,
      actor,
      restoredFrom ? 'version_restored' : 'saved',
      target.requestId,
      {
        status: data.status.toLowerCase(),
        previousStatus: existing.status.toLowerCase(),
        ...(restoredFrom && { restoredFromVersion: restoredFrom.version }),
      },
      restoredFrom?.id,
    );
    return saved;
  });
}

/**
 * Restores an activity's details from one of its revisions as a new
 * version. Today's status and release time are kept, so a restore never
 * publishes a draft or hides a live activity; changed dates are not part of
 * a restore (they are separate per-date actions).
 */
export function restoreActivityVersion(
  target: { id: string; expected: number; requestId: string },
  revision: { id: string; version: number; data: unknown },
  actor: Actor,
) {
  return saveActivity(
    target,
    actor,
    (existing) => {
      const current = toActivity(existing!);
      const stored = (revision.data ?? {}) as Partial<Activity>;
      const pick = <K extends keyof Activity>(key: K) =>
        (key in stored ? stored[key] : current[key]) as Activity[K];
      return parseRestored(activityInputSchema, {
        kind: pick('kind'),
        title: pick('title'),
        summary: pick('summary'),
        leader: pick('leader'),
        tag: pick('tag'),
        locationId: pick('locationId'),
        venue: pick('venue'),
        image: pick('image'),
        schedule: pick('schedule'),
        joinMode: pick('joinMode'),
        capacity: pick('capacity'),
        status: current.status === 'scheduled' ? 'published' : current.status,
        publishAt: current.publishAt,
      });
    },
    revision,
  );
}

export function registerActivityRoutes(app: FastifyInstance) {
  const staff = (request: FastifyRequest) =>
    requireRole(request, Role.PASTOR, Role.ADMIN);
  const done = (
    reply: FastifyReply,
    row: ActivityRow,
    exceptions?: ExceptionRow[],
  ) => {
    reply.header('etag', `"${row.version}"`);
    reply.header('cache-control', 'private, no-store');
    return {
      data: staffActivity(row),
      version: row.version,
      ...(exceptions && { exceptions: exceptions.map(toException) }),
    };
  };

  app.get('/v1/staff/activities', async (request, reply) => {
    staff(request);
    const rows = await prisma.activity.findMany({
      include: { exceptions: { orderBy: { date: 'asc' } } },
      orderBy: [{ startDate: 'asc' }, { title: 'asc' }],
    });
    reply.header('cache-control', 'private, no-store');
    const data: StaffActivities = {
      activities: rows.map(staffActivity),
      exceptions: rows.flatMap((row) => row.exceptions.map(toException)),
    };
    return { data };
  });

  app.post('/v1/staff/activities', async (request, reply) => {
    const actor = staff(request);
    const input = parse(activityInputSchema, request.body ?? {});
    const row = await saveActivity(
      { requestId: request.id },
      actor,
      () => input,
    );
    reply.status(201);
    return done(reply, row, []);
  });

  app.patch<{ Params: { id: string } }>(
    '/v1/staff/activities/:id',
    async (request, reply) => {
      const actor = staff(request);
      const expected = requireVersion(request.headers['if-match']);
      const input = parse(activityInputSchema, request.body ?? {});
      const row = await saveActivity(
        { id: request.params.id, expected, requestId: request.id },
        actor,
        () => input,
      );
      return done(reply, row);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/staff/activities/:id',
    async (request, reply) => {
      const actor = staff(request);
      const expected = requireVersion(request.headers['if-match']);
      await prisma.$transaction(async (tx) => {
        const existing = await tx.activity.findUnique({
          where: { id: request.params.id },
        });
        if (!existing) throw notFound('Activity');
        if (existing.version !== expected) throw versionConflict();
        if (existing.status === 'PUBLISHED')
          throw new AppError(
            409,
            'ARCHIVE_FIRST',
            'Published activities are archived, not deleted. Archive it first.',
          );
        // Conditional: a save or publish that committed meanwhile changed
        // the version or status, so nothing is deleted.
        const deleted = await tx.activity.deleteMany({
          where: {
            id: existing.id,
            version: expected,
            status: { not: 'PUBLISHED' },
          },
        });
        if (deleted.count === 0) throw versionConflict();
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'content.activity_deleted',
          entityType: 'activity',
          entityId: existing.id,
          requestId: request.id,
          metadata: { version: existing.version, record: toActivity(existing) },
        });
        await recordContentChange(tx, ENTITY, existing.id, null);
      });
      reply.header('cache-control', 'private, no-store');
      return reply.status(204).send();
    },
  );

  /**
   * Changes the activity's dates at the version the editor saw: the change
   * bumps the activity's version so a stale editor can't overwrite it.
   */
  async function changeDate(
    request: FastifyRequest<{ Params: { id: string; date: string } }>,
    actor: Actor,
    apply: (tx: Tx, row: ActivityRow) => Promise<string>,
  ) {
    const expected = requireVersion(request.headers['if-match']);
    const { date } = request.params;
    return prisma.$transaction(async (tx) => {
      const existing = await tx.activity.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) throw notFound('Activity');
      if (existing.version !== expected) throw versionConflict();
      const schedule = toActivity(existing).schedule;
      // Only a date the schedule really has; never invent occurrences.
      if (!isRealDate(date) || !scheduleDates(schedule, date, date).length)
        throw invalid({ date: 'This activity doesn’t happen on that date.' });
      const action = await apply(tx, existing);
      const result = await tx.activity.updateMany({
        where: { id: existing.id, version: expected },
        data: { version: { increment: 1 }, updatedById: actor.id },
      });
      if (result.count === 0) throw versionConflict();
      const saved = (await tx.activity.findUnique({
        where: { id: existing.id },
      }))!;
      await recordSave(tx, saved, actor, action, request.id, { date });
      const exceptions = await tx.activityException.findMany({
        where: { activityId: saved.id },
        orderBy: { date: 'asc' },
      });
      return { saved, exceptions };
    });
  }

  app.put<{ Params: { id: string; date: string } }>(
    '/v1/staff/activities/:id/exceptions/:date',
    async (request, reply) => {
      const actor = staff(request);
      const input = parse(activityExceptionInputSchema, request.body ?? {});
      const { saved, exceptions } = await changeDate(
        request,
        actor,
        async (tx, row) => {
          if (input.kind === 'changed') {
            const start = input.startTime || row.startTime;
            const end = input.endTime || row.endTime;
            if (end && start && end <= start)
              throw invalid({
                endTime: 'The end time must be after the start time.',
              });
            if ([start, end].some((time) => time && inDaylightSavingHour(time)))
              throw invalid({ startTime: DAYLIGHT_SAVING_MESSAGE });
          }
          const values =
            input.kind === 'cancelled'
              ? {
                  kind: 'cancelled',
                  note: input.note,
                  startTime: '',
                  endTime: '',
                  venue: '',
                }
              : { ...input };
          await tx.activityException.upsert({
            where: {
              activityId_date: {
                activityId: row.id,
                date: asDate(request.params.date),
              },
            },
            create: {
              activityId: row.id,
              date: asDate(request.params.date),
              ...values,
            },
            update: values,
          });
          return input.kind === 'cancelled' ? 'date_cancelled' : 'date_changed';
        },
      );
      return done(reply, saved, exceptions);
    },
  );

  app.delete<{ Params: { id: string; date: string } }>(
    '/v1/staff/activities/:id/exceptions/:date',
    async (request, reply) => {
      const actor = staff(request);
      const { saved, exceptions } = await changeDate(
        request,
        actor,
        async (tx, row) => {
          const removed = await tx.activityException.deleteMany({
            where: { activityId: row.id, date: asDate(request.params.date) },
          });
          if (removed.count === 0)
            throw new AppError(
              409,
              'NOTHING_TO_RESTORE',
              'This date already follows the usual schedule.',
            );
          return 'date_restored';
        },
      );
      return done(reply, saved, exceptions);
    },
  );
}
