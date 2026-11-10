import { z } from 'zod';
import {
  checkSessionAuthority,
  lockUserSecurity,
  prisma,
  recordAudit,
} from '@grace-abounds/database';
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
import { fingerprint } from '../../../../lib/server/sessions';

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

const wrong = (method: 'password' | 'code') =>
  new HttpError(
    400,
    method === 'password' ? 'INVALID_PASSWORD' : 'INVALID_CODE',
    method === 'password'
      ? 'That password is not correct.'
      : 'That code is wrong or has expired. Request a new code.',
  );

/**
 * Re-authentication for sensitive account changes. Success records a new
 * authentication time on this session only (ordinary refreshes never move
 * it). The proof is re-checked under the user's security lock: the session
 * must still be valid and, for passwords, the verified password must still
 * be the current one.
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

  let verifiedHash: string | null = null;
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
    if (!(await verifyPassword(user.passwordHash, input.password)))
      throw wrong('password');
    verifiedHash = user.passwordHash;
  } else if (
    !(await allow('codeVerifyIp', ip)) ||
    !(await allow('codeVerifyEmail', user.email))
  ) {
    throw new HttpError(
      429,
      'TOO_MANY_ATTEMPTS',
      'Too many attempts. Request a new code and try again.',
    );
  }

  const outcome = await prisma.$transaction(async (tx) => {
    if (input.method === 'code') {
      const challenge = await consumeChallenge(tx, {
        purpose: 'REAUTH',
        email: user.email,
        code: input.code,
      });
      if (!challenge) return 'wrong' as const;
    }
    await lockUserSecurity(tx, userId);
    if (
      (await checkSessionAuthority(tx, { userId, sessionId: row.id })) !== 'ok'
    )
      return 'invalid' as const;
    if (verifiedHash) {
      const current = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { passwordHash: true },
      });
      if (
        !current.passwordHash ||
        fingerprint(current.passwordHash) !== fingerprint(verifiedHash)
      )
        return 'wrong' as const;
    }
    await tx.userSession.update({
      where: { id: row.id },
      data: { authenticatedAt: new Date() },
    });
    await recordAudit(tx, {
      actorId: userId,
      action: 'session.reauthenticated',
      entityType: 'UserSession',
      entityId: row.id,
      metadata: { method: input.method },
    });
    return 'ok' as const;
  });
  if (outcome === 'invalid')
    throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  if (outcome === 'wrong') throw wrong(input.method);
  await clearLimit(
    input.method === 'password' ? 'passwordEmail' : 'codeVerifyEmail',
    user.email,
  );
  return ok({ status: 'confirmed' });
});
