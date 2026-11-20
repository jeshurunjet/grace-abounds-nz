import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  accountDeletionSchema,
  staffDeletionSchema,
} from '@grace-abounds/validation';
import { Role } from '@grace-abounds/database';
import { parse } from '../lib/errors.js';
import { requireRecentAuth, requireRole } from '../lib/identity.js';
import {
  deleteAccount,
  requireDeletionAllowed,
  staffProtected,
  toDeletionInfo,
} from '../lib/account-deletion.js';

/*
 * Account deletion (Phase 5C). See lib/account-deletion.ts for the policy.
 *
 *   POST /v1/me/deletion                  delete my member account
 *                                         ({ confirm: "DELETE" }, recent
 *                                         sign-in; staff accounts refused)
 *   POST /v1/staff/members/:id/deletion   staff, only at the member's
 *                                         request ({ confirm, memberRequested:
 *                                         true, requestNote }, recent sign-in)
 *
 * Both answer 503 DELETION_UNAVAILABLE until real execution is enabled
 * (owner walkthrough). Success means access has been removed and the
 * immediate follow-up done; the remaining "Deleted user" records are
 * purged later (purgeAfter), which the response states rather than
 * claiming everything is gone.
 */

const noStore = (reply: FastifyReply) =>
  reply.header('cache-control', 'private, no-store');

export function registerAccountDeletionRoutes(app: FastifyInstance) {
  app.post('/v1/me/deletion', async (request, reply) => {
    const actor = requireRecentAuth(request);
    parse(accountDeletionSchema, request.body ?? {});
    if (actor.role !== Role.MEMBER) throw staffProtected();
    requireDeletionAllowed();
    const { row } = await deleteAccount({
      actor,
      targetId: actor.id,
      via: 'self',
      requestId: request.id,
    });
    noStore(reply);
    return { data: toDeletionInfo(row) };
  });

  app.post<{ Params: { id: string } }>(
    '/v1/staff/members/:id/deletion',
    async (request, reply) => {
      requireRole(request, Role.PASTOR, Role.ADMIN);
      const actor = requireRecentAuth(request);
      const input = parse(staffDeletionSchema, request.body ?? {});
      if (request.params.id === actor.id) throw staffProtected();
      requireDeletionAllowed();
      const { row } = await deleteAccount({
        actor,
        targetId: request.params.id,
        via: 'staff',
        requestNote: input.requestNote,
        requestId: request.id,
      });
      noStore(reply);
      return { data: toDeletionInfo(row) };
    },
  );
}
