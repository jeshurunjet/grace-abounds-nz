import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  activityExceptionInputSchema,
  activityInputSchema,
  DAYLIGHT_SAVING_MESSAGE,
  formatDate,
  formatTime,
  inDaylightSavingHour,
  isRealDate,
  nzLocalToUtc,
  nzNow,
  scheduleDates,
  type Activity,
  type ActivityException,
  type ActivityInput,
  type ActivitySchedule,
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
import { queueCalendarSync } from '../lib/calendar-queue.js';
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
 * Joining and booking are in participation.ts (Phase 3B); saves here check
 * them under the same row lock.
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

/**
 * The latest scheduled release that has already passed, as epoch
 * milliseconds (0 when none). A release changes what the public sees without
 * any save, so the public bundle and the freshness stamp both carry this
 * marker; an open page that sees it move on refreshes. It only ever names a
 * moment that has passed, never an upcoming release.
 */
export async function releasedThrough(now = new Date()) {
  const { _max } = await prisma.activity.aggregate({
    where: { status: 'PUBLISHED', publishAt: { lte: now } },
    _max: { publishAt: true },
  });
  return _max.publishAt?.getTime() ?? 0;
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

/** Takes the activity's row lock until the transaction ends. */
export async function lockActivity(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Activity" WHERE "id" = ${id} FOR UPDATE`;
  return rows.length > 0;
}

const refuse = (field: string, message: string) =>
  new AppError(422, 'VALIDATION_FAILED', message, { [field]: message });

/**
 * Bookings stay valid when staff save (Phase 3B). Under the activity's row
 * lock, a save or restore is refused, naming the date, if it would change
 * how people join while anyone is on it, put the capacity below the places
 * taken, or take a booked upcoming date off the schedule. Cancelling one
 * date instead keeps its bookings.
 */
async function checkBookings(
  tx: Tx,
  existing: ActivityRow,
  data: Awaited<ReturnType<typeof toData>>,
) {
  const groups = await tx.participation.groupBy({
    by: ['dateKey'],
    where: {
      activityId: existing.id,
      status: 'ACTIVE',
      OR: [{ dateKey: '' }, { dateKey: { gte: nzNow().date } }],
    },
    _count: { _all: true },
    orderBy: { dateKey: 'asc' },
  });
  if (!groups.length) return;
  const counts = groups.map((group) => ({
    date: group.dateKey,
    count: (group._count as { _all: number })._all,
  }));
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  if (data.joinMode !== existing.joinMode)
    throw refuse(
      'joinMode',
      `${total} ${total === 1 ? 'person has' : 'people have'} ${existing.joinMode === 'booking' ? 'booked upcoming dates' : 'joined'}. Those places need cancelling before people join a different way.`,
    );
  for (const { date, count } of counts)
    if (data.capacity != null && count > data.capacity)
      throw refuse(
        'capacity',
        date
          ? `${formatDate(date, true)} already has ${count} bookings, so the capacity can’t be lower than ${count}.`
          : `${count} people have joined, so the capacity can’t be lower than ${count}.`,
      );
  if (data.joinMode !== 'booking') return;
  const schedule: ActivitySchedule = {
    repeat: data.repeat as ActivitySchedule['repeat'],
    date: dateOnly(data.startDate),
    until: data.untilDate ? dateOnly(data.untilDate) : '',
    days: data.days,
    monthWeek: data.monthWeek,
    monthDay: data.monthDay,
    startTime: data.startTime,
    endTime: data.endTime,
  };
  for (const { date, count } of counts)
    if (date && !scheduleDates(schedule, date, date).length)
      throw refuse(
        schedule.until && date > schedule.until
          ? 'schedule.until'
          : 'schedule.date',
        `${formatDate(date, true)} has ${count} ${count === 1 ? 'booking' : 'bookings'} and would no longer be on the schedule. Keep that date, or cancel just that date so its bookings are kept.`,
      );
}

/**
 * A changed date keeps its own start or end time and takes the other from
 * the series, so new series times must still leave every changed date
 * ending after it starts. Refused naming the date; never discarded.
 */
async function checkChangedDates(
  tx: Tx,
  activityId: string,
  startTime: string,
  endTime: string,
) {
  const changed = await tx.activityException.findMany({
    where: { activityId, kind: 'changed' },
    orderBy: { date: 'asc' },
  });
  for (const item of changed) {
    const start = item.startTime || startTime;
    const end = item.endTime || endTime;
    if (!start || !end || end > start) continue;
    const date = formatDate(toException(item).date, true);
    const [field, message] = item.endTime
      ? [
          'schedule.startTime',
          `${date} has its own end time (${formatTime(item.endTime)}), which would be before this start time. Change that date or set it back to the usual time first.`,
        ]
      : [
          'schedule.endTime',
          `${date} has its own start time (${formatTime(item.startTime)}), which would be after this end time. Change that date or set it back to the usual time first.`,
        ];
    throw new AppError(422, 'VALIDATION_FAILED', message, { [field]: message });
  }
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
  await queueCalendarSync(tx, row.id);
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
    // The row lock: a booking can't slip in between the checks and the save.
    await lockActivity(tx, target.id);
    const existing = await tx.activity.findUnique({ where: { id: target.id } });
    if (!existing) throw notFound('Activity');
    if (existing.version !== target.expected) throw versionConflict();
    const data = await toData(tx, input(existing));
    await checkChangedDates(tx, existing.id, data.startTime, data.endTime);
    await checkBookings(tx, existing, data);
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
        // Joining and booking history is kept (Phase 3B).
        if (
          await tx.participation.count({ where: { activityId: existing.id } })
        )
          throw new AppError(
            409,
            'HAS_HISTORY',
            'People have joined or booked this activity, so it is kept for its history. Leave it archived instead.',
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
        await queueCalendarSync(tx, existing.id);
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
