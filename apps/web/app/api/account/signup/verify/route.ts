import { z } from 'zod';
import { Prisma, prisma, recordAudit } from '@grace-abounds/database';
import {
  codeField,
  emailField,
} from '../../../../../lib/server/account-schemas';
import { consumeChallenge } from '../../../../../lib/server/challenges';
import {
  accountRoute,
  clientIp,
  HttpError,
  ok,
} from '../../../../../lib/server/http';
import { allow, clearLimit } from '../../../../../lib/server/limits';

export const runtime = 'nodejs';

const schema = z.object({ email: emailField, code: codeField }).strict();

const wrongCode = () =>
  new HttpError(
    400,
    'INVALID_CODE',
    'That code is wrong or has expired. Request a new code.',
  );

/**
 * Step 2 of password sign-up. The account (Member, verified email, the
 * password submitted with this exact challenge) is created in the same
 * transaction that consumes the code.
 */
export const POST = accountRoute(schema, async ({ email, code }, request) => {
  if (
    !(await allow('codeVerifyIp', clientIp(request))) ||
    !(await allow('codeVerifyEmail', email))
  )
    throw new HttpError(
      429,
      'TOO_MANY_ATTEMPTS',
      'Too many attempts. Request a new code and try again.',
    );
  try {
    const user = await prisma.$transaction(async (tx) => {
      const challenge = await consumeChallenge(tx, {
        purpose: 'SIGNUP_VERIFY',
        email,
        code,
      });
      if (!challenge?.pendingPasswordHash) return null;
      const created = await tx.user.create({
        data: {
          email,
          name: challenge.pendingName,
          emailVerified: new Date(),
          passwordHash: challenge.pendingPasswordHash,
          passwordUpdatedAt: new Date(),
        },
        select: { id: true },
      });
      await recordAudit(tx, {
        actorId: created.id,
        action: 'member.signed_up',
        entityType: 'User',
        entityId: created.id,
        metadata: { method: 'password' },
      });
      return created;
    });
    if (!user) throw wrongCode();
    await clearLimit('codeVerifyEmail', email);
    return ok({ status: 'verified' }, 201);
  } catch (error) {
    // The address was proved, so it is safe to say an account now exists
    // (for example, one created meanwhile with an email code or Google).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new HttpError(
        409,
        'ACCOUNT_EXISTS',
        'This email already has an account. Sign in instead.',
      );
    throw error;
  }
});
