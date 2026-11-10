import type { FastifyInstance, FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';
import { prisma, type Role } from '@grace-abounds/database';
import { AppError, forbidden, unauthenticated } from './errors.js';

export type Actor = { id: string; email: string; role: Role };

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

/**
 * Verifies the gateway's signed identity assertion, then loads the user's
 * current role and status from the database. Browser-supplied IDs or roles
 * are never trusted.
 */
export function registerIdentity(app: FastifyInstance) {
  const key = assertionKey();
  app.decorateRequest('actor', null);
  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization;
    if (!header) return;
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    let userId: string;
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: 'grace-web',
        audience: 'grace-api',
        algorithms: ['HS256'],
      });
      userId = String(payload.sub ?? '');
    } catch {
      throw new AppError(
        401,
        'INVALID_SESSION',
        'Your session has expired. Please sign in again.',
      );
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!user)
      throw new AppError(
        401,
        'INVALID_SESSION',
        'Your session has expired. Please sign in again.',
      );
    if (user.status !== 'ACTIVE')
      throw new AppError(
        403,
        'ACCOUNT_SUSPENDED',
        'This account is not active. Contact the church office.',
      );
    request.actor = { id: user.id, email: user.email, role: user.role };
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
