import { z } from 'zod';
import { prisma, recordAudit, revokeSessions } from '@grace-abounds/database';
import { passwordField } from '../../../../lib/server/account-schemas';
import { requireRecentAuth } from '../../../../lib/server/current';
import { accountRoute, ok } from '../../../../lib/server/http';
import { hashPassword } from '../../../../lib/server/password';

export const runtime = 'nodejs';

const schema = z.object({ password: passwordField }).strict();

/**
 * Adds or changes the password (requires recent authentication). Other
 * sessions are signed out; this one stays signed in.
 */
export const POST = accountRoute(schema, async ({ password }) => {
  const { userId, row } = await requireRecentAuth();
  const passwordHash = await hashPassword(password);
  const hadPassword = await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, passwordUpdatedAt: new Date() },
    });
    await revokeSessions(tx, userId, { except: row.id });
    await recordAudit(tx, {
      actorId: userId,
      action: before.passwordHash
        ? 'account.password_changed'
        : 'account.password_added',
      entityType: 'User',
      entityId: userId,
    });
    return !!before.passwordHash;
  });
  return ok({ status: hadPassword ? 'changed' : 'added' });
});
