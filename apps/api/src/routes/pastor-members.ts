import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  assertPastorRemains,
  LastPastorError,
  lockPastorSet,
  prisma,
  recordAudit,
  revokeSessions,
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
import { requireRole } from '../lib/identity.js';

const statusChange = z
  .object({ status: z.enum(['ACTIVE', 'SUSPENDED']) })
  .strict();
const roleChange = z
  .object({ role: z.enum(['MEMBER', 'ADMIN', 'PASTOR']) })
  .strict();

/**
 * Re-checks the acting Pastor inside the locked transaction: a Pastor who
 * was demoted or suspended while this request was in flight cannot finish
 * a Pastor-only change.
 */
async function assertStillPastor(
  tx: Prisma.TransactionClient,
  actorId: string,
) {
  const current = await tx.user.findUnique({
    where: { id: actorId },
    select: { role: true, status: true },
  });
  if (current?.role !== Role.PASTOR || current.status !== 'ACTIVE')
    throw forbidden();
}

const lastPastor = () =>
  new AppError(
    409,
    'LAST_PASTOR',
    'The last active Pastor cannot be suspended or demoted.',
  );
const selfLockout = () =>
  new AppError(
    409,
    'SELF_LOCKOUT',
    'Ask another Pastor to change your own account.',
  );

/**
 * Pastor-only account management. Every change that could reduce the number
 * of active Pastors takes the shared advisory lock first (see
 * lockPastorSet), so concurrent changes cannot remove the last one.
 */
export function registerPastorMemberRoutes(app: FastifyInstance) {
  /** Suspend or reactivate. Suspension ends all of the account's sessions at once. */
  app.patch<{ Params: { id: string } }>(
    '/v1/pastor/members/:id/status',
    async (request) => {
      const actor = requireRole(request, Role.PASTOR);
      const { status } = parse(statusChange, request.body ?? {});
      const expected = requireVersion(request.headers['if-match']);
      if (request.params.id === actor.id) throw selfLockout();
      try {
        return await prisma.$transaction(async (tx) => {
          await lockPastorSet(tx);
          await assertStillPastor(tx, actor.id);
          const target = await tx.user.findUnique({
            where: { id: request.params.id },
          });
          if (!target) throw notFound('Member');
          if (target.version !== expected) throw versionConflict();
          await assertPastorRemains(tx, target.id, { status });
          const updated = await tx.user.update({
            where: { id: target.id },
            data: {
              status,
              version: { increment: 1 },
              ...(status === 'SUSPENDED' && {
                sessionVersion: { increment: 1 },
              }),
            },
            select: { id: true, status: true, version: true },
          });
          if (status === 'SUSPENDED') await revokeSessions(tx, target.id);
          await recordAudit(tx, {
            actorId: actor.id,
            action:
              status === 'SUSPENDED'
                ? 'member.suspended'
                : 'member.reactivated',
            entityType: 'User',
            entityId: target.id,
            requestId: request.id,
            metadata: { previousStatus: target.status },
          });
          const { version, ...data } = updated;
          return { data, version };
        });
      } catch (error) {
        if (error instanceof LastPastorError) throw lastPastor();
        throw error;
      }
    },
  );

  /** Change role (Member/Admin/Pastor). Role is reloaded on every request. */
  app.patch<{ Params: { id: string } }>(
    '/v1/pastor/members/:id/role',
    async (request) => {
      const actor = requireRole(request, Role.PASTOR);
      const { role } = parse(roleChange, request.body ?? {});
      const expected = requireVersion(request.headers['if-match']);
      if (request.params.id === actor.id) throw selfLockout();
      try {
        return await prisma.$transaction(async (tx) => {
          await lockPastorSet(tx);
          await assertStillPastor(tx, actor.id);
          const target = await tx.user.findUnique({
            where: { id: request.params.id },
          });
          if (!target) throw notFound('Member');
          if (target.version !== expected) throw versionConflict();
          if (target.status !== 'ACTIVE')
            throw new AppError(
              409,
              'ACCOUNT_NOT_ACTIVE',
              'Reactivate this account before changing its role.',
            );
          await assertPastorRemains(tx, target.id, { role });
          const updated = await tx.user.update({
            where: { id: target.id },
            data: { role, version: { increment: 1 } },
            select: { id: true, role: true, version: true },
          });
          await recordAudit(tx, {
            actorId: actor.id,
            action: 'member.role_changed',
            entityType: 'User',
            entityId: target.id,
            requestId: request.id,
            metadata: { previousRole: target.role, role },
          });
          const { version, ...data } = updated;
          return { data, version };
        });
      } catch (error) {
        if (error instanceof LastPastorError) throw lastPastor();
        throw error;
      }
    },
  );
}
