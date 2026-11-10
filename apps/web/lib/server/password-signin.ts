import { CredentialsSignin } from 'next-auth';
import { normalizeEmail, prisma } from '@grace-abounds/database';
import { clientIp } from './http';
import { allow, clearLimit } from './limits';
import { verifyPassword } from './password';
import { fingerprint, type PasswordProof } from './sessions';

/** Shown when password sign-in is throttled; does not reveal whether the account exists. */
export class PasswordRateLimited extends CredentialsSignin {
  code = 'rate_limited';
}

/**
 * Password sign-in check. Limits are consumed before any Argon2 work; a
 * successful result carries proof of which password was verified; a
 * missing account, missing password, wrong password and inactive account all
 * return the same null.
 */
export async function authorizePassword(
  input: Partial<Record<string, unknown>> | undefined,
  request: Request,
) {
  const email = normalizeEmail(String(input?.email ?? ''));
  const candidate = String(input?.password ?? '');
  if (!email || !candidate || candidate.length > 128) return null;
  if (!(await allow('passwordIp', clientIp(request))))
    throw new PasswordRateLimited();
  if (!(await allow('passwordEmail', email))) throw new PasswordRateLimited();
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      status: true,
      passwordHash: true,
      sessionVersion: true,
    },
  });
  const valid = await verifyPassword(user?.passwordHash, candidate);
  if (!user || !valid || user.status !== 'ACTIVE') return null;
  await clearLimit('passwordEmail', email);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    // Server-only: checked again when the session is created (startSession).
    passwordProof: {
      sessionVersion: user.sessionVersion,
      hashFingerprint: fingerprint(user.passwordHash!),
    } satisfies PasswordProof,
  };
}
