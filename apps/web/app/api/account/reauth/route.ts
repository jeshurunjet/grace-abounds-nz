import { z } from 'zod';
import { prisma, recordAudit } from '@grace-abounds/database';
import { codeField } from '../../../../lib/server/account-schemas';
import {
  consumeChallenge,
  issueChallenge,
} from '../../../../lib/server/challenges';
import { requireSignedIn } from '../../../../lib/server/current';
import { emails, sendEmail } from '../../../../lib/server/email';
import {
  accountRoute,
  clientIp,
  HttpError,
  ok,
} from '../../../../lib/server/http';
import { allow, clearLimit } from '../../../../lib/server/limits';
import { verifyPassword } from '../../../../lib/server/password';

export const runtime = 'nodejs';

const schema = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('password'),
      password: z.string().min(1).max(128),
    })
    .strict(),
  z.object({ method: z.literal('request-code') }).strict(),
  z.object({ method: z.literal('code'), code: codeField }).strict(),
]);

/**
 * Re-authentication for sensitive account changes. Success records a new
 * authentication time on this session only; ordinary session refreshes
 * never change it.
 */
export const POST = accountRoute(schema, async (input, request) => {
  const { userId, row } = await requireSignedIn();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  const ip = clientIp(request);

  if (input.method === 'request-code') {
    if (
      (await allow('codeRequestIp', ip)) &&
      (await allow('codeRequestEmail', user.email))
    ) {
      const code = await prisma.$transaction((tx) =>
        issueChallenge(tx, { purpose: 'REAUTH', email: user.email, userId }),
      );
      await sendEmail(emails.reauthCode(user.email, code));
    }
    return ok({ status: 'code_sent' }, 202);
  }

  let proved = false;
  if (input.method === 'password') {
    if (
      !(await allow('passwordIp', ip)) ||
      !(await allow('passwordEmail', user.email))
    )
      throw new HttpError(
        429,
        'TOO_MANY_ATTEMPTS',
        'Too many attempts. Wait 15 minutes or use an email code.',
      );
    proved = await verifyPassword(user.passwordHash, input.password);
    if (proved) await clearLimit('passwordEmail', user.email);
  } else {
    if (
      !(await allow('codeVerifyIp', ip)) ||
      !(await allow('codeVerifyEmail', user.email))
    )
      throw new HttpError(
        429,
        'TOO_MANY_ATTEMPTS',
        'Too many attempts. Request a new code and try again.',
      );
    proved = !!(await prisma.$transaction((tx) =>
      consumeChallenge(tx, {
        purpose: 'REAUTH',
        email: user.email,
        code: input.code,
      }),
    ));
    if (proved) await clearLimit('codeVerifyEmail', user.email);
  }
  if (!proved)
    throw new HttpError(
      400,
      input.method === 'password' ? 'INVALID_PASSWORD' : 'INVALID_CODE',
      input.method === 'password'
        ? 'That password is not correct.'
        : 'That code is wrong or has expired. Request a new code.',
    );
  const updated = await prisma.userSession.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { authenticatedAt: new Date() },
  });
  if (updated.count !== 1)
    throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  await recordAudit(prisma, {
    actorId: userId,
    action: 'session.reauthenticated',
    entityType: 'UserSession',
    entityId: row.id,
    metadata: { method: input.method },
  });
  return ok({ status: 'confirmed' });
});
