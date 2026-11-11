import { cookies, headers } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
  checkSessionAuthority,
  isRecentlyAuthenticated,
  lockUserSecurity,
  prisma,
  SESSION_MAX_AGE_SECONDS,
  type Prisma,
} from '@grace-abounds/database';

const INTENT_COOKIE = 'grace-auth-intent';
const INTENT_MAX_AGE_SECONDS = 10 * 60;
export type IntentKind = 'google' | 'passkey';

function intentKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET must be set.');
  return new TextEncoder().encode(`intent:${secret}`);
}

/** Coarse device description for the Settings session list. */
function deviceLabel(userAgent: string) {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const os = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'unknown device';
  return `${browser} on ${os}`;
}

/**
 * Request-scoped context for every Auth.js request, set by the route
 * wrapper. `link` is set only after the guard has checked that a signed-in,
 * recently authenticated session holds a valid intent; the intent cookie
 * alone never switches on linking. `createdUserIds` records accounts created
 * by this same request (a brand-new Google sign-up).
 */
type LinkContext = { userId: string; sessionId: string };
type AuthRequestContext = {
  link: LinkContext | null;
  createdUserIds: Set<string>;
};
const authRequest = new AsyncLocalStorage<AuthRequestContext>();
export const runAuthRequest = <T>(
  link: LinkContext | null,
  run: () => Promise<T>,
) => authRequest.run({ link, createdUserIds: new Set() }, run);
export const runLinked = <T>(link: LinkContext, run: () => Promise<T>) =>
  runAuthRequest(link, run);
export const currentLink = () => authRequest.getStore()?.link ?? null;
export const noteCreatedUser = (userId: string) =>
  authRequest.getStore()?.createdUserIds.add(userId);
const createdThisRequest = (userId: string) =>
  authRequest.getStore()?.createdUserIds.has(userId) ?? false;

/** Thrown when a Google link or passkey must not be saved. */
export class CredentialRefused extends Error {}

/**
 * Inside the write transaction: the credential must be for the linking user,
 * whose session must still be valid and recently authenticated, checked
 * under the same per-user lock as resets and revocations.
 */
async function assertLinkAuthority(
  tx: Prisma.TransactionClient,
  link: LinkContext,
  targetUserId: string,
) {
  if (targetUserId !== link.userId)
    throw new CredentialRefused(
      'Linking target does not match the signed-in user.',
    );
  await lockUserSecurity(tx, link.userId);
  const authority = await checkSessionAuthority(tx, {
    userId: link.userId,
    sessionId: link.sessionId,
    requireRecent: true,
  });
  if (authority !== 'ok')
    throw new CredentialRefused(
      'The session that started linking is no longer valid.',
    );
}

/**
 * Adapter `linkAccount`. Auth.js calls it before the jwt callback, so the
 * authority check must happen here, in the same transaction as the write.
 * Without a linking context the only allowed link is the first provider of
 * an account created in this same request (new Google sign-up).
 */
export async function persistLinkedAccount(
  data: Prisma.AccountUncheckedCreateInput,
) {
  const link = currentLink();
  if (!link) {
    if (!createdThisRequest(data.userId))
      throw new CredentialRefused(
        'Sign-in methods can only be linked from Settings.',
      );
    return prisma.account.create({ data });
  }
  return prisma.$transaction(async (tx) => {
    await assertLinkAuthority(tx, link, data.userId);
    return tx.account.create({ data });
  });
}

/**
 * Adapter `createAuthenticator`. Passkeys are only ever added from Settings.
 * If authority has gone since Auth.js linked the passkey account a moment
 * earlier, that account row is removed too, so nothing usable remains.
 */
export async function persistAuthenticator(
  data: Prisma.AuthenticatorUncheckedCreateInput,
) {
  const link = currentLink();
  try {
    if (!link)
      throw new CredentialRefused('Passkeys can only be added from Settings.');
    return await prisma.$transaction(async (tx) => {
      await assertLinkAuthority(tx, link, data.userId);
      return tx.authenticator.create({ data });
    });
  } catch (error) {
    if (error instanceof CredentialRefused)
      await prisma.account.deleteMany({
        where: {
          userId: data.userId,
          type: 'webauthn',
          providerAccountId: data.providerAccountId,
        },
      });
    throw error;
  }
}

/**
 * Server-only evidence from password verification: which password hash and
 * security epoch were checked. Never taken from the browser or session updates.
 */
export type PasswordProof = { sessionVersion: number; hashFingerprint: string };
export const fingerprint = (passwordHash: string) =>
  createHash('sha256').update(passwordHash).digest('hex');

/** Thrown when a session must not be created; Auth.js treats it as a failed sign-in. */
export class SessionRefused extends Error {}

/**
 * Called once per successful authentication (from the Auth.js jwt callback),
 * as one transaction under the user's security lock:
 * - the account must still be active;
 * - a password sign-in's proof must still match the current password hash
 *   and sessionVersion (a reset or change in between refuses it);
 * - when linking Google or registering a passkey from Settings, the session
 *   that started it must still be valid and recently authenticated, and is
 *   kept; otherwise linking fails closed;
 * - every other sign-in creates a new session record (revoked ones are never
 *   brought back).
 */
export async function startSession(
  userId: string,
  method: string,
  proof?: PasswordProof | null,
) {
  const userAgent = (await headers()).get('user-agent') ?? '';
  const link = currentLink();
  return prisma.$transaction(async (tx) => {
    await lockUserSecurity(tx, userId);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { sessionVersion: true, status: true, passwordHash: true },
    });
    if (user.status !== 'ACTIVE')
      throw new SessionRefused('Account is not active.');
    if (
      method === 'password' &&
      (!proof ||
        !user.passwordHash ||
        proof.sessionVersion !== user.sessionVersion ||
        fingerprint(user.passwordHash) !== proof.hashFingerprint)
    )
      throw new SessionRefused('Password proof is no longer current.');
    if (link) {
      const authority =
        link.userId === userId
          ? await checkSessionAuthority(tx, {
              userId,
              sessionId: link.sessionId,
              requireRecent: true,
            })
          : 'invalid';
      if (authority !== 'ok')
        throw new SessionRefused(
          'The session that started linking is no longer valid.',
        );
      return tx.userSession.findUniqueOrThrow({
        where: { id: link.sessionId },
      });
    }
    return tx.userSession.create({
      data: {
        userId,
        sessionVersion: user.sessionVersion,
        method,
        deviceLabel: deviceLabel(userAgent),
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      },
    });
  });
}

/** Sets a short-lived, signed cookie saying this session intends to link/register. */
export async function setIntent(
  kind: IntentKind,
  userId: string,
  sessionId: string,
) {
  const token = await new SignJWT({ kind, sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${INTENT_MAX_AGE_SECONDS}s`)
    .sign(intentKey());
  (await cookies()).set(INTENT_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: INTENT_MAX_AGE_SECONDS,
  });
}

export async function readIntent(kind?: IntentKind) {
  const token = (await cookies()).get(INTENT_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, intentKey(), {
      algorithms: ['HS256'],
    });
    if (kind && payload.kind !== kind) return null;
    return {
      kind: payload.kind as IntentKind,
      sub: String(payload.sub),
      sid: String(payload.sid),
    };
  } catch {
    return null;
  }
}

export const INTENT_COOKIE_NAME = INTENT_COOKIE;

/** Current session row, if signed in and still valid. */
export async function currentSessionRow(
  sessionId: string | undefined,
  userId: string | undefined,
) {
  if (!sessionId || !userId) return null;
  return prisma.userSession.findFirst({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}

export const isRecent = (row: { authenticatedAt: Date }) =>
  isRecentlyAuthenticated(row.authenticatedAt);
