import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  memberStatusInputSchema,
  peopleQuerySchema,
  type AccountRole,
  type AccountStatusName,
  type AppointmentCounts,
  type PeoplePage,
  type PersonDetail,
  type PersonSummary,
  type PrayerCounts,
  type StaffSummary,
} from '@grace-abounds/validation';
import {
  lockPastorSet,
  lockUserSecurity,
  prisma,
  recordAudit,
  revokeSessions,
  Role,
  type Prisma,
  type User,
} from '@grace-abounds/database';
import {
  AppError,
  forbidden,
  notFound,
  parse,
  requireVersion,
  versionConflict,
} from '../lib/errors.js';
import { lockAndRecheck, requireRole, type Actor } from '../lib/identity.js';
import { isDeleted, personContact, personName } from '../lib/display-name.js';

/*
 * People (Phase 4C). Both fixed staff accounts look up canonical accounts
 * and suspend or reactivate ordinary members; staff accounts are never
 * changed here (staff provisioning is the operator's staff:add command).
 * Members get 403 on every route.
 *
 *   GET   /v1/staff/members?q=&status=&role=&cursor=&limit=   directory
 *   GET   /v1/staff/members/:id                               one person
 *   PATCH /v1/staff/members/:id/status   suspend/reactivate a MEMBER (If-Match,
 *                                        recent sign-in)
 *   GET   /v1/staff/summary                                   Home counts
 *
 * Responses hold account details only, never credentials. Care counts are
 * role-scoped: appointment status counts (logistics) for both staff roles,
 * prayer counts for the Pastor only. Admin receives no prayer data or
 * counts from any of these routes.
 *
 * The former Pastor-only role and status routes (/v1/pastor/members/:id/
 * role|status) are removed: they could promote members to staff or change
 * the fixed staff accounts.
 */

type Tx = Prisma.TransactionClient;
const STAFF: Role[] = [Role.PASTOR, Role.ADMIN];
const staff = (request: Parameters<typeof requireRole>[0]) =>
  requireRole(request, ...STAFF);
const noStore = (reply: FastifyReply) =>
  reply.header('cache-control', 'private, no-store');

const summarySelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  version: true,
} as const;
type SummaryRow = Pick<User, keyof typeof summarySelect>;

const roleName = (role: User['role']) => role.toLowerCase() as AccountRole;
const statusName = (status: User['status']) =>
  status.toLowerCase() as AccountStatusName;

function toSummary(row: SummaryRow, actor: Actor): PersonSummary {
  const deleted = isDeleted(row);
  return {
    id: row.id,
    // A deleted account (kept 30 days before purge) shows as "Deleted user".
    name: deleted ? personName(row) : (row.name?.trim() ?? ''),
    email: deleted ? '' : row.email,
    role: roleName(row.role),
    status: statusName(row.status),
    manageable:
      row.role === Role.MEMBER &&
      row.id !== actor.id &&
      (row.status === 'ACTIVE' || row.status === 'SUSPENDED'),
    createdAt: row.createdAt.toISOString(),
    version: row.version,
  };
}

const emptyAppointments = (): AppointmentCounts => ({
  requested: 0,
  proposed: 0,
  confirmed: 0,
  completed: 0,
  cancelled: 0,
  declined: 0,
});
async function appointmentCounts(
  where: Prisma.AppointmentWhereInput,
): Promise<AppointmentCounts> {
  const counts = emptyAppointments();
  const rows = await prisma.appointment.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });
  for (const row of rows)
    counts[row.status.toLowerCase() as keyof AppointmentCounts] =
      row._count._all;
  return counts;
}
async function prayerCounts(
  where: Prisma.PrayerRequestWhereInput,
): Promise<PrayerCounts> {
  const counts: PrayerCounts = { submitted: 0, praying: 0, prayedFor: 0 };
  const rows = await prisma.prayerRequest.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });
  for (const row of rows) {
    if (row.status === 'SUBMITTED') counts.submitted = row._count._all;
    else if (row.status === 'PRAYING') counts.praying = row._count._all;
    else counts.prayedFor = row._count._all;
  }
  return counts;
}

const staffProtected = () =>
  new AppError(403, 'STAFF_PROTECTED', 'Staff accounts can’t be changed here.');

export function registerStaffMemberRoutes(app: FastifyInstance) {
  app.get('/v1/staff/members', async (request, reply) => {
    const actor = staff(request);
    const query = parse(peopleQuerySchema, request.query ?? {});
    const filters: Prisma.UserWhereInput[] = [];
    if (query.q)
      filters.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q.toLowerCase() } },
        ],
      });
    if (query.status !== 'all')
      filters.push({
        status: query.status === 'active' ? 'ACTIVE' : 'SUSPENDED',
      });
    if (query.role === 'member') filters.push({ role: Role.MEMBER });
    if (query.role === 'staff') filters.push({ role: { in: STAFF } });
    // Ordered by email (unique), so the cursor is the last email shown.
    if (query.cursor) filters.push({ email: { gt: query.cursor } });
    const rows = await prisma.user.findMany({
      where: { AND: filters },
      select: summarySelect,
      orderBy: { email: 'asc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    noStore(reply);
    return {
      data: {
        items: page.map((row) => toSummary(row, actor)),
        nextCursor: rows.length > query.limit ? (page.at(-1)?.email ?? '') : '',
      } satisfies PeoplePage,
    };
  });

  async function detail(id: string, actor: Actor): Promise<PersonDetail> {
    const row = await prisma.user.findUnique({
      where: { id },
      select: { ...summarySelect, phone: true, emailVerified: true },
    });
    if (!row) throw notFound('Person');
    const pastor = actor.role === Role.PASTOR;
    const deletion = isDeleted(row)
      ? await prisma.accountDeletion.findUnique({ where: { userId: row.id } })
      : null;
    return {
      ...toSummary(row, actor),
      phone: personContact(row).phone,
      emailVerified: !!row.emailVerified,
      ...(deletion && {
        deletion: {
          via: deletion.via === 'staff' ? 'staff' : 'self',
          requestedAt: deletion.requestedAt.toISOString(),
          purgeAfter: deletion.purgeAfter.toISOString(),
        },
      }),
      appointments: await appointmentCounts({ userId: row.id }),
      ...(pastor && { prayers: await prayerCounts({ userId: row.id }) }),
    };
  }

  app.get<{ Params: { id: string } }>(
    '/v1/staff/members/:id',
    async (request, reply) => {
      const actor = staff(request);
      const data = await detail(request.params.id, actor);
      noStore(reply);
      reply.header('etag', `"${data.version}"`);
      return { data, version: data.version };
    },
  );

  /**
   * Suspend or reactivate an ordinary member. Needs a recent sign-in
   * (403 REAUTH_REQUIRED otherwise, with nothing changed). Under the shared
   * locks (Pastor set, then the actor's and the target's security locks) the
   * actor's session, recent sign-in and staff role are re-checked, the target is re-read, and the
   * status change, session revocation and audit commit together.
   */
  app.patch<{ Params: { id: string } }>(
    '/v1/staff/members/:id/status',
    async (request, reply) => {
      const actor = staff(request);
      const { status } = parse(memberStatusInputSchema, request.body ?? {});
      const expected = requireVersion(request.headers['if-match']);
      const next = status === 'suspended' ? 'SUSPENDED' : 'ACTIVE';
      if (request.params.id === actor.id) throw staffProtected();
      await prisma.$transaction(async (tx: Tx) => {
        await lockPastorSet(tx);
        // The acting session must still be valid and recently signed in
        // ("Confirm it's you"), checked under the actor's security lock.
        await lockAndRecheck(tx, actor, { requireRecent: true });
        const self = await tx.user.findUnique({
          where: { id: actor.id },
          select: { role: true, status: true },
        });
        if (!self || !STAFF.includes(self.role) || self.status !== 'ACTIVE')
          throw forbidden();
        const peek = await tx.user.findUnique({
          where: { id: request.params.id },
          select: { role: true },
        });
        if (!peek) throw notFound('Person');
        if (peek.role !== Role.MEMBER) throw staffProtected();
        // Serialized with the member's sign-ins, resets and revocations.
        await lockUserSecurity(tx, request.params.id);
        const target = await tx.user.findUniqueOrThrow({
          where: { id: request.params.id },
        });
        if (target.role !== Role.MEMBER) throw staffProtected();
        if (target.version !== expected) throw versionConflict();
        if (target.status !== 'ACTIVE' && target.status !== 'SUSPENDED')
          throw new AppError(
            409,
            'ACCOUNT_LOCKED',
            'This account is being deleted and can’t be changed here.',
          );
        if (target.status === next)
          throw new AppError(
            409,
            'NO_CHANGE',
            next === 'SUSPENDED'
              ? 'This account is already suspended.'
              : 'This account is already active.',
          );
        const changed = await tx.user.updateMany({
          where: { id: target.id, version: expected, role: Role.MEMBER },
          data: {
            status: next,
            version: { increment: 1 },
            ...(next === 'SUSPENDED' && { sessionVersion: { increment: 1 } }),
          },
        });
        if (changed.count === 0) throw versionConflict();
        if (next === 'SUSPENDED') await revokeSessions(tx, target.id);
        await recordAudit(tx, {
          actorId: actor.id,
          action:
            next === 'SUSPENDED' ? 'member.suspended' : 'member.reactivated',
          entityType: 'User',
          entityId: target.id,
          requestId: request.id,
          metadata: {
            previousStatus: target.status,
            actorRole: self.role,
            version: expected + 1,
          },
        });
      });
      const data = await detail(request.params.id, actor);
      noStore(reply);
      reply.header('etag', `"${data.version}"`);
      return { data, version: data.version };
    },
  );

  app.get('/v1/staff/summary', async (request, reply) => {
    const actor = staff(request);
    const members = await prisma.user.groupBy({
      by: ['status'],
      where: { role: Role.MEMBER },
      _count: { _all: true },
    });
    const count = (status: User['status']) =>
      members.find((row) => row.status === status)?._count._all ?? 0;
    const [published, awaitingApproval, appointments] = await Promise.all([
      prisma.sermon.count({
        where: { archivedAt: null, liveVersion: { not: null } },
      }),
      prisma.sermon.count({ where: { archivedAt: null, review: 'PENDING' } }),
      appointmentCounts({}),
    ]);
    const data: StaffSummary = {
      members: { active: count('ACTIVE'), suspended: count('SUSPENDED') },
      sermons: { published, awaitingApproval },
      appointments,
      ...(actor.role === Role.PASTOR && { prayers: await prayerCounts({}) }),
    };
    noStore(reply);
    return { data };
  });
}
