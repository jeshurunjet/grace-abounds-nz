import { cookies, headers } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import {
  isRecentlyAuthenticated,
  prisma,
  SESSION_MAX_AGE_SECONDS,
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
 * Called once per successful authentication (from the Auth.js jwt callback).
 * Linking Google or registering a passkey from Settings keeps the current
 * session (proved by the signed intent cookie); every other sign-in creates
 * a new session record. A revoked session is never brought back.
 */
export async function startSession(userId: string, method: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { sessionVersion: true, status: true },
  });
  if (user.status !== 'ACTIVE') throw new Error('Account is not active.');
  const intent = await readIntent();
  if (intent && intent.sub === userId) {
    const current = await prisma.userSession.findFirst({
      where: {
        id: intent.sid,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        sessionVersion: user.sessionVersion,
      },
    });
    if (current) return current;
  }
  const userAgent = (await headers()).get('user-agent') ?? '';
  return prisma.userSession.create({
    data: {
      userId,
      sessionVersion: user.sessionVersion,
      method,
      deviceLabel: deviceLabel(userAgent),
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    },
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
