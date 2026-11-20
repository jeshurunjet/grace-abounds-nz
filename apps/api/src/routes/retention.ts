import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  HOLD_MAX_REVIEW_DAYS,
  nzLocalToUtc,
  retentionHoldInputSchema,
  retentionHoldRenewSchema,
  retentionRunInputSchema,
  reviewDateAllowed,
} from '@grace-abounds/validation';
import {
  lockUserSecurity,
  prisma,
  recordAudit,
  Role,
  type Prisma,
} from '@grace-abounds/database';
import {
  AppError,
  forbidden,
  notFound,
  parse,
  requireVersion,
  versionConflict,
} from '../lib/errors.js';
import {
  lockAndRecheck,
  requireRecentAuth,
  requireRole,
  type Actor,
} from '../lib/identity.js';
import {
  listHolds,
  retentionPreview,
  runRetention,
  toHoldItem,
} from '../lib/retention.js';
import { lockRetentionGate } from '../lib/retention-holds.js';

/*
 * Records retention for staff (Phase 5C). Both fixed staff accounts may
 * see what is due, manage records holds and (once enabled) remove due
 * records. Members get 403. Nothing here shows care contents.
 *
 *   GET  /v1/staff/retention            what is due, what holds keep back
 *   POST /v1/staff/retention/run        "Delete eligible records now"
 *                                       (recent sign-in; 503 while disabled)
 *   GET  /v1/staff/holds                active records holds
 *   POST /v1/staff/holds                place one (recent sign-in)
 *   POST /v1/staff/holds/:id/renew      new review date (If-Match)
 *   POST /v1/staff/holds/:id/release    release it (If-Match)
 *
 * A hold names a person, a reason (legal obligation, investigation, claim),
 * a short reference and basis (never care details) and a review date at
 * most HOLD_MAX_REVIEW_DAYS ahead. It protects until released; an overdue
 * review is shown. Every change is audited without the reference or basis.
 *
 * Every hold change takes the retention gate exclusively, first, so it is
 * serialized with every clean-up transaction (see retention-holds). Placing
 * one then takes the person's security lock and only then checks that the
 * account still exists (a purge may have removed it meanwhile).
 */

type Tx = Prisma.TransactionClient;
const STAFF: Role[] = [Role.PASTOR, Role.ADMIN];
const noStore = (reply: FastifyReply) =>
  reply.header('cache-control', 'private, no-store');

const badReviewDate = () =>
  new AppError(
    422,
    'VALIDATION_FAILED',
    'Choose a review date within a year.',
    {
      reviewBy: `Choose a date after today and within ${HOLD_MAX_REVIEW_DAYS} days.`,
    },
  );

/** Inside a transaction: the acting staff session, recent and still staff. */
async function recheckStaff(tx: Tx, actor: Actor) {
  await lockAndRecheck(tx, actor, { requireRecent: true });
  const self = await tx.user.findUnique({
    where: { id: actor.id },
    select: { role: true, status: true },
  });
  if (!self || !STAFF.includes(self.role) || self.status !== 'ACTIVE')
    throw forbidden();
}

async function holdView(id: string) {
  const hold = await prisma.retentionHold.findUniqueOrThrow({ where: { id } });
  const people = await prisma.user.findMany({
    where: { id: hold.userId },
    select: { id: true, name: true, email: true, status: true },
  });
  return toHoldItem(hold, people);
}

export function registerRetentionRoutes(app: FastifyInstance) {
  app.get('/v1/staff/retention', async (request, reply) => {
    requireRole(request, ...STAFF);
    noStore(reply);
    return { data: await retentionPreview() };
  });

  app.post('/v1/staff/retention/run', async (request, reply) => {
    requireRole(request, ...STAFF);
    const actor = requireRecentAuth(request);
    const { requestKey } = parse(retentionRunInputSchema, request.body ?? {});
    const data = await runRetention(actor, requestKey, request.id);
    noStore(reply);
    return { data };
  });

  app.get('/v1/staff/holds', async (request, reply) => {
    requireRole(request, ...STAFF);
    noStore(reply);
    return { data: await listHolds() };
  });

  app.post('/v1/staff/holds', async (request, reply) => {
    requireRole(request, ...STAFF);
    const actor = requireRecentAuth(request);
    const input = parse(retentionHoldInputSchema, request.body ?? {});
    if (!reviewDateAllowed(input.reviewBy)) throw badReviewDate();
    const hold = await prisma.$transaction(async (tx) => {
      await lockRetentionGate(tx, 'holds');
      await recheckStaff(tx, actor);
      // The person's lock first, then the check: a purge that removed the
      // account before this point is seen, and none can start until the
      // hold is committed (the gate).
      await lockUserSecurity(tx, input.userId);
      const person = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });
      if (!person) throw notFound('Person');
      const created = await tx.retentionHold.create({
        data: {
          userId: person.id,
          reason: input.reason.toUpperCase() as never,
          reference: input.reference,
          basis: input.basis,
          reviewBy: nzLocalToUtc(input.reviewBy, '00:00'),
          placedById: actor.id,
        },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'retention.hold_placed',
        entityType: 'User',
        entityId: person.id,
        requestId: request.id,
        metadata: { holdId: created.id, reason: input.reason },
      });
      return created;
    });
    noStore(reply);
    reply.status(201);
    return { data: await holdView(hold.id) };
  });

  const change = (
    path: 'renew' | 'release',
    apply: (raw: unknown) => {
      data: Prisma.RetentionHoldUpdateManyMutationInput;
      metadata: Record<string, unknown>;
    },
  ) =>
    app.post<{ Params: { id: string } }>(
      `/v1/staff/holds/:id/${path}`,
      async (request, reply) => {
        requireRole(request, ...STAFF);
        const actor = requireRecentAuth(request);
        const expected = requireVersion(request.headers['if-match']);
        const { data, metadata } = apply(request.body ?? {});
        await prisma.$transaction(async (tx) => {
          await lockRetentionGate(tx, 'holds');
          await recheckStaff(tx, actor);
          const hold = await tx.retentionHold.findUnique({
            where: { id: request.params.id },
          });
          if (!hold || hold.releasedAt) throw notFound('Hold');
          if (hold.version !== expected) throw versionConflict();
          await lockUserSecurity(tx, hold.userId);
          const changed = await tx.retentionHold.updateMany({
            where: { id: hold.id, version: expected, releasedAt: null },
            data: {
              ...data,
              ...(path === 'release' && { releasedById: actor.id }),
              version: { increment: 1 },
            },
          });
          if (!changed.count) throw versionConflict();
          await recordAudit(tx, {
            actorId: actor.id,
            action: `retention.hold_${path === 'renew' ? 'renewed' : 'released'}`,
            entityType: 'User',
            entityId: hold.userId,
            requestId: request.id,
            metadata: { holdId: hold.id, ...metadata },
          });
        });
        noStore(reply);
        if (path === 'release') return reply.status(204).send();
        return { data: await holdView(request.params.id) };
      },
    );

  change('renew', (raw) => {
    const { reviewBy } = parse(retentionHoldRenewSchema, raw);
    if (!reviewDateAllowed(reviewBy)) throw badReviewDate();
    return {
      data: {
        reviewBy: nzLocalToUtc(reviewBy, '00:00'),
        reviewedAt: new Date(),
      },
      metadata: { reviewBy },
    };
  });
  change('release', () => ({
    data: { releasedAt: new Date() },
    metadata: {},
  }));
}
