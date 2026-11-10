import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, recordAudit, Role } from '@grace-abounds/database';
import { AppError, notFound, parse } from '../lib/errors.js';
import { requireRole } from '../lib/identity.js';

const statusChange = z
  .object({ status: z.enum(['ACTIVE', 'SUSPENDED']) })
  .strict();

export function registerPastorMemberRoutes(app: FastifyInstance) {
  /** Suspend or reactivate an account. Suspension ends all its sessions. */
  app.patch<{ Params: { id: string } }>(
    '/v1/pastor/members/:id/status',
    async (request) => {
      const actor = requireRole(request, Role.PASTOR);
      const { status } = parse(statusChange, request.body ?? {});
      if (request.params.id === actor.id)
        throw new AppError(
          409,
          'SELF_LOCKOUT',
          'You cannot change your own account status.',
        );
      return prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: request.params.id },
        });
        if (!target) throw notFound('Member');
        if (target.role === Role.PASTOR && status === 'SUSPENDED') {
          const activePastors = await tx.user.count({
            where: { role: Role.PASTOR, status: 'ACTIVE' },
          });
          if (activePastors <= 1)
            throw new AppError(
              409,
              'LAST_PASTOR',
              'The last active Pastor cannot be suspended.',
            );
        }
        const updated = await tx.user.update({
          where: { id: target.id },
          data: { status, version: { increment: 1 } },
          select: { id: true, status: true, version: true },
        });
        if (status === 'SUSPENDED')
          await tx.session.deleteMany({ where: { userId: target.id } });
        await recordAudit(tx, {
          actorId: actor.id,
          action:
            status === 'SUSPENDED' ? 'member.suspended' : 'member.reactivated',
          entityType: 'User',
          entityId: target.id,
          requestId: request.id,
          metadata: { previousStatus: target.status },
        });
        const { version, ...data } = updated;
        return { data, version };
      });
    },
  );
}
