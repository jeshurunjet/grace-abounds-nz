import type { FastifyInstance, FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';
import {
  checkSessionAuthority,
  isRecentlyAuthenticated,
  loadActiveSession,
  lockUserSecurity,
  prisma,
  type Prisma,
  type Role,
} from '@grace-abounds/database';
import { AppError, forbidden, unauthenticated } from './errors.js';

export type Actor = {
  id: string;
  email: string;
  role: Role;
  sessionId: string;
  authenticatedAt: Date;
};

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

function assertionKey() {
  const secret = process.env.API_ASSERTION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('API_ASSERTION_SECRET must be set (32+ characters).');
  return new TextEncoder().encode(secret);
}

const expired = () =>
  new AppError(
    401,
    'INVALID_SESSION',
    'Your session has expired. Please sign in again.',
  );

/**
 * Verifies the gateway's signed identity assertion, then checks the session
 * record itself: it belongs to the asserted user, is not revoked or expired,
 * matches the current sessionVersion, and the account is active. Role comes
 * from the database. Browser-supplied IDs or roles are never trusted.
 */
export function registerIdentity(app: FastifyInstance) {
  const key = assertionKey();
  app.decorateRequest('actor', null);
  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization;
    if (!header) return;
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    let claims: { userId: string; sessionId: string; sessionVersion: number };
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: 'grace-web',
        audience: 'grace-api',
        algorithms: ['HS256'],
        maxTokenAge: '60s',
      });
      claims = {
        userId: String(payload.sub ?? ''),
        sessionId: String(payload.sid ?? ''),
        sessionVersion: Number(payload.sv),
      };
    } catch {
      throw expired();
    }
    const row = await loadActiveSession(prisma, claims);
    if (!row) {
      const user = await prisma.user.findUnique({
        where: { id: claims.userId },
        select: { status: true },
      });
      if (user && user.status !== 'ACTIVE')
        throw new AppError(
          403,
          'ACCOUNT_SUSPENDED',
          'This account is not active. Contact the church office.',
        );
      throw expired();
    }
    request.actor = {
      id: row.user.id,
      email: row.user.email,
      role: row.user.role,
      sessionId: row.id,
      authenticatedAt: row.authenticatedAt,
    };
  });
}

/** Returns the signed-in actor or throws 401. */
export function requireActor(request: FastifyRequest): Actor {
  if (!request.actor) throw unauthenticated();
  return request.actor;
}

/** Returns the actor if they hold one of the roles, otherwise 401/403. */
export function requireRole(request: FastifyRequest, ...roles: Role[]): Actor {
  const actor = requireActor(request);
  if (!roles.includes(actor.role)) throw forbidden();
  return actor;
}

/** Sensitive changes need a sign-in or re-authentication in the last 10 minutes. */
export function requireRecentAuth(request: FastifyRequest): Actor {
  const actor = requireActor(request);
  if (!isRecentlyAuthenticated(actor.authenticatedAt))
    throw new AppError(
      403,
      'REAUTH_REQUIRED',
      'For your security, confirm it’s you first.',
    );
  return actor;
}

/**
 * Inside a transaction: takes the actor's security lock and re-checks that
 * the acting session is still valid (and recently authenticated when
 * required) before a credential or session change commits.
 */
export async function lockAndRecheck(
  tx: Prisma.TransactionClient,
  actor: Actor,
  options: { requireRecent?: boolean } = {},
) {
  await lockUserSecurity(tx, actor.id);
  const authority = await checkSessionAuthority(tx, {
    userId: actor.id,
    sessionId: actor.sessionId,
    requireRecent: options.requireRecent,
  });
  if (authority === 'invalid') throw expired();
  if (authority === 'reauth')
    throw new AppError(
      403,
      'REAUTH_REQUIRED',
      'For your security, confirm it’s you first.',
    );
}
