import { z } from 'zod';
import {
  checkSessionAuthority,
  lockUserSecurity,
  prisma,
  recordAudit,
  revokeSessions,
} from '@grace-abounds/database';
import { passwordField } from '../../../../lib/server/account-schemas';
import { requireRecentAuth } from '../../../../lib/server/current';
import { accountRoute, HttpError, ok } from '../../../../lib/server/http';
import { hashPassword } from '../../../../lib/server/password';

export const runtime = 'nodejs';

const schema = z.object({ password: passwordField }).strict();

/**
 * Adds or changes the password. Other sessions are signed out; this one
 * stays signed in. Hashing happens first (slow), then the write commits
 * only if, under the user's security lock, this session is still valid and
 * recently authenticated — so a reset or revocation that happened during
 * hashing wins.
 */
export const POST = accountRoute(schema, async ({ password }) => {
  const { userId, row } = await requireRecentAuth();
  const passwordHash = await hashPassword(password);
  const hadPassword = await prisma.$transaction(async (tx) => {
    await lockUserSecurity(tx, userId);
    const authority = await checkSessionAuthority(tx, {
      userId,
      sessionId: row.id,
      requireRecent: true,
    });
    if (authority === 'invalid')
      throw new HttpError(
        401,
        'UNAUTHENTICATED',
        'Please sign in to continue.',
      );
    if (authority === 'reauth')
      throw new HttpError(
        403,
        'REAUTH_REQUIRED',
        'For your security, confirm it’s you first.',
      );
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
