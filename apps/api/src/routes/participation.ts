import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  isRealDate,
  nzNow,
  participationInputSchema,
  scheduleDates,
  type Availability,
  type MemberPlan,
  type RosterEntry,
} from '@grace-abounds/validation';
import {
  prisma,
  Prisma,
  recordAudit,
  Role,
  type Participation as ParticipationRow,
} from '@grace-abounds/database';
import { AppError, notFound, parse } from '../lib/errors.js';
import { personContact, personName } from '../lib/display-name.js';
import {
  lockAndRecheck,
  requireActor,
  requireRole,
  type Actor,
} from '../lib/identity.js';
import { lockActivity, toActivity } from './activities.js';

/*
 * Joining and booking (Phase 3B).
 *
 *   GET    /v1/public/availability             places taken (counts only)
 *   GET    /v1/member/participations           my plans (signed in)
 *   POST   /v1/member/participations           join, or book one date
 *   DELETE /v1/member/participations/:id       cancel my own
 *   GET    /v1/staff/activities/:id/roster     who is on it (Pastor, Admin)
 *   DELETE /v1/staff/participations/:id        remove someone (Pastor, Admin)
 *
 * Every booking takes the activity's row lock (SELECT … FOR UPDATE) before
 * checking that it is published and live, that the date is real, upcoming
 * and not cancelled, and that a place is left; staff saves take the same
 * lock before checking capacity and dates against bookings, so the last
 * place can't be taken twice and a capacity can't drop under a booking made
 * meanwhile. One row per person and occurrence (unique), so a retried join
 * returns the existing booking. Cancelling keeps the row and records an
 * event: history is never deleted.
 */

type Tx = Prisma.TransactionClient;
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

const refused = (code: string, message: string) =>
  new AppError(409, code, message);
const invalid = (fieldErrors: Record<string, string>) =>
  new AppError(
    422,
    'VALIDATION_FAILED',
    Object.values(fieldErrors)[0] ?? 'Some fields need attention.',
    fieldErrors,
  );

/** The person's own plan, with what they need to show or cancel it. */
async function toPlan(tx: Tx, row: ParticipationRow): Promise<MemberPlan> {
  const activity = (await tx.activity.findUnique({
    where: { id: row.activityId },
    include: { exceptions: true },
  }))!;
  const shown = toActivity(activity);
  return {
    id: row.id,
    activityId: row.activityId,
    date: row.dateKey,
    createdAt: row.createdAt.toISOString(),
    activity: { title: shown.title, slug: shown.slug, kind: shown.kind },
    available: shown.status === 'published',
    dateCancelled:
      !!row.dateKey &&
      activity.exceptions.some(
        (item) =>
          item.kind === 'cancelled' && dateOnly(item.date) === row.dateKey,
      ),
  };
}

/**
 * Cancels a participation (own, or staff removing someone). Idempotent: an
 * already-cancelled one is returned as it is. Past dates are history.
 */
async function cancel(
  request: FastifyRequest<{ Params: { id: string } }>,
  actor: Actor,
  own: boolean,
) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.participation.findFirst({
      where: {
        id: request.params.id,
        ...(own && { userId: actor.id }),
      },
    });
    // Someone else's booking is not found, never "forbidden".
    if (!found) throw notFound(own ? 'Booking' : 'Participation');
    if (found.status === 'CANCELLED') return { row: found, changed: false };
    if (found.dateKey && found.dateKey < nzNow().date)
      throw refused('PAST', 'This date has already happened.');
    const result = await tx.participation.updateMany({
      where: { id: found.id, status: 'ACTIVE' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    const row = (await tx.participation.findUnique({
      where: { id: found.id },
    }))!;
    if (result.count === 0) return { row, changed: false };
    const action = own ? 'cancelled' : 'removed';
    await tx.participationEvent.create({
      data: { participationId: row.id, action, actorId: actor.id },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: own
        ? 'activity.booking_cancelled'
        : 'activity.participant_removed',
      entityType: 'participation',
      entityId: row.id,
      requestId: request.id,
      metadata: {
        activityId: row.activityId,
        date: row.dateKey,
        ...(!own && { userId: row.userId }),
      },
    });
    return { row, changed: true };
  });
}

export function registerParticipationRoutes(app: FastifyInstance) {
  const noStore = (reply: FastifyReply, scope: 'public' | 'private') =>
    reply.header(
      'cache-control',
      scope === 'public' ? 'no-store' : 'private, no-store',
    );

  /**
   * Places taken on published, live activities: upcoming dates and ongoing
   * activities only. Counts, never names or ids of people.
   */
  app.get('/v1/public/availability', async (_request, reply) => {
    const now = new Date();
    const groups = await prisma.participation.groupBy({
      by: ['activityId', 'dateKey'],
      where: {
        status: 'ACTIVE',
        OR: [{ dateKey: '' }, { dateKey: { gte: nzNow(now).date } }],
        activity: {
          status: 'PUBLISHED',
          joinMode: { not: 'none' },
          OR: [{ publishAt: null }, { publishAt: { lte: now } }],
        },
      },
      _count: { _all: true },
    });
    const data: Availability = {};
    for (const group of groups)
      (data[group.activityId] ??= {})[group.dateKey] = group._count._all;
    noStore(reply, 'public');
    return { data };
  });

  app.get('/v1/member/participations', async (request, reply) => {
    const actor = requireActor(request);
    const rows = await prisma.participation.findMany({
      where: { userId: actor.id, status: 'ACTIVE' },
      orderBy: [{ dateKey: 'asc' }, { createdAt: 'asc' }],
    });
    const data = await prisma.$transaction((tx) =>
      Promise.all(rows.map((row) => toPlan(tx, row))),
    );
    noStore(reply, 'private');
    return { data };
  });

  app.post('/v1/member/participations', async (request, reply) => {
    const actor = requireActor(request);
    const input = parse(participationInputSchema, request.body ?? {});
    const result = await prisma.$transaction(async (tx) => {
      // The member's own lock first (same order as account deletion), so
      // no booking can land after their account was deleted.
      await lockAndRecheck(tx, actor);
      if (!(await lockActivity(tx, input.activityId)))
        throw notFound('Activity');
      const row = (await tx.activity.findUnique({
        where: { id: input.activityId },
        include: { exceptions: true },
      }))!;
      const now = new Date();
      const activity = toActivity(row, now);
      // Drafts, scheduled and archived activities don't exist for members.
      if (activity.status !== 'published') throw notFound('Activity');
      if (activity.joinMode === 'none')
        throw refused('NOT_OPEN', 'This activity doesn’t take bookings.');
      const booking = activity.joinMode === 'booking';
      if (!booking && input.date)
        throw invalid({ date: 'This group is joined, not booked by date.' });
      const dateKey = booking ? input.date : '';
      if (booking) {
        if (
          !isRealDate(dateKey) ||
          !scheduleDates(activity.schedule, dateKey, dateKey).length
        )
          throw invalid({ date: 'This activity doesn’t happen on that date.' });
        if (dateKey < nzNow(now).date)
          throw refused('PAST', 'This date has already happened.');
        if (
          row.exceptions.some(
            (item) =>
              item.kind === 'cancelled' && dateOnly(item.date) === dateKey,
          )
        )
          throw refused('DATE_CANCELLED', 'This date has been cancelled.');
      }
      const key = {
        activityId_dateKey_userId: {
          activityId: row.id,
          dateKey,
          userId: actor.id,
        },
      };
      const existing = await tx.participation.findUnique({ where: key });
      // A retry, or a second click: the place is already theirs.
      if (existing?.status === 'ACTIVE')
        return { row: existing, created: false };
      if (activity.capacity != null) {
        const taken = await tx.participation.count({
          where: { activityId: row.id, dateKey, status: 'ACTIVE' },
        });
        if (taken >= activity.capacity)
          throw refused(
            'FULL',
            booking
              ? 'Sorry, this date is fully booked.'
              : 'Sorry, this group is full.',
          );
      }
      const saved = existing
        ? await tx.participation.update({
            where: { id: existing.id },
            data: { status: 'ACTIVE', cancelledAt: null },
          })
        : await tx.participation.create({
            data: { activityId: row.id, userId: actor.id, dateKey },
          });
      const action = booking ? 'booked' : 'joined';
      await tx.participationEvent.create({
        data: { participationId: saved.id, action, actorId: actor.id },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: `activity.${action}`,
        entityType: 'participation',
        entityId: saved.id,
        requestId: request.id,
        metadata: { activityId: row.id, date: dateKey },
      });
      return { row: saved, created: true };
    });
    const data = await prisma.$transaction((tx) => toPlan(tx, result.row));
    noStore(reply, 'private');
    reply.status(result.created ? 201 : 200);
    return { data };
  });

  app.delete<{ Params: { id: string } }>(
    '/v1/member/participations/:id',
    async (request, reply) => {
      const actor = requireActor(request);
      await cancel(request, actor, true);
      noStore(reply, 'private');
      return reply.status(204).send();
    },
  );

  /** Everyone who has joined or booked, with cancellations (history). */
  app.get<{ Params: { id: string } }>(
    '/v1/staff/activities/:id/roster',
    async (request, reply) => {
      requireRole(request, Role.PASTOR, Role.ADMIN);
      const activity = await prisma.activity.findUnique({
        where: { id: request.params.id },
        select: { id: true },
      });
      if (!activity) throw notFound('Activity');
      const rows = await prisma.participation.findMany({
        where: { activityId: activity.id },
        include: {
          user: { select: { name: true, email: true, status: true } },
        },
        orderBy: [{ dateKey: 'asc' }, { createdAt: 'asc' }],
      });
      const data: RosterEntry[] = rows.map((row) => ({
        id: row.id,
        date: row.dateKey,
        name: personName(row.user),
        email: personContact(row.user).email,
        status: row.status === 'ACTIVE' ? 'active' : 'cancelled',
        createdAt: row.createdAt.toISOString(),
        cancelledAt: row.cancelledAt?.toISOString() ?? '',
      }));
      noStore(reply, 'private');
      return { data };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/staff/participations/:id',
    async (request, reply) => {
      const actor = requireRole(request, Role.PASTOR, Role.ADMIN);
      await cancel(request, actor, false);
      noStore(reply, 'private');
      return reply.status(204).send();
    },
  );
}
