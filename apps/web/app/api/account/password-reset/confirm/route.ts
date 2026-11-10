import { z } from 'zod';
import {
  lockUserSecurity,
  prisma,
  recordAudit,
  revokeSessions,
} from '@grace-abounds/database';
import {
  codeField,
  emailField,
  passwordField,
} from '../../../../../lib/server/account-schemas';
import { consumeChallenge } from '../../../../../lib/server/challenges';
import {
  accountRoute,
  clientIp,
  HttpError,
  ok,
} from '../../../../../lib/server/http';
import { allow, clearLimit } from '../../../../../lib/server/limits';
import { hashPassword } from '../../../../../lib/server/password';

export const runtime = 'nodejs';

const schema = z
  .object({ email: emailField, code: codeField, password: passwordField })
  .strict();

/**
 * Sets a new password and ends every session (sessionVersion increments and
 * all session records are revoked) in the transaction that consumes the code.
 * The person then signs in again.
 */
export const POST = accountRoute(
  schema,
  async ({ email, code, password }, request) => {
    if (
      !(await allow('codeVerifyIp', clientIp(request))) ||
      !(await allow('codeVerifyEmail', email))
    )
      throw new HttpError(
        429,
        'TOO_MANY_ATTEMPTS',
        'Too many attempts. Request a new code and try again.',
      );
    const passwordHash = await hashPassword(password);
    const done = await prisma.$transaction(async (tx) => {
      const challenge = await consumeChallenge(tx, {
        purpose: 'PASSWORD_RESET',
        email,
        code,
      });
      if (!challenge?.userId) return false;
      // Serialized with password changes, sign-ins and revocations for this user.
      await lockUserSecurity(tx, challenge.userId);
      const updated = await tx.user.updateMany({
        where: { id: challenge.userId, email, status: 'ACTIVE' },
        data: {
          passwordHash,
          passwordUpdatedAt: new Date(),
          emailVerified: new Date(),
          sessionVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;
      await revokeSessions(tx, challenge.userId);
      await recordAudit(tx, {
        actorId: challenge.userId,
        action: 'account.password_reset',
        entityType: 'User',
        entityId: challenge.userId,
      });
      return true;
    });
    if (!done)
      throw new HttpError(
        400,
        'INVALID_CODE',
        'That code is wrong or has expired. Request a new code.',
      );
    await clearLimit('codeVerifyEmail', email);
    await clearLimit('passwordEmail', email);
    return ok({ status: 'password_reset' });
  },
);
