import type { FastifyInstance } from 'fastify';
import {
  prisma,
  RECENT_AUTH_MS,
  recordAudit,
  revokeSessions,
} from '@grace-abounds/database';
import { AppError, notFound } from '../lib/errors.js';
import { requireActor, requireRecentAuth } from '../lib/identity.js';

/**
 * Personal sign-in methods and sessions. Every account has a verified email,
 * so email-code sign-in always remains available; removing Google or a
 * passkey can never leave an account with no way in.
 */
export function registerAccountRoutes(app: FastifyInstance) {
  app.get('/v1/me/security', async (request) => {
    const actor = requireActor(request);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: {
        email: true,
        emailVerified: true,
        passwordHash: true,
        passwordUpdatedAt: true,
        accounts: {
          where: { provider: 'google' },
          select: { providerAccountId: true },
        },
        authenticators: {
          select: {
            credentialID: true,
            credentialDeviceType: true,
            credentialBackedUp: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const recentUntil = new Date(
      actor.authenticatedAt.getTime() + RECENT_AUTH_MS,
    );
    return {
      data: {
        email: user.email,
        emailCodeAvailable: user.emailVerified !== null,
        hasPassword: user.passwordHash !== null,
        passwordUpdatedAt: user.passwordUpdatedAt,
        googleLinked: user.accounts.length > 0,
        passkeys: user.authenticators.map((item) => ({
          id: item.credentialID,
          deviceType: item.credentialDeviceType,
          backedUp: item.credentialBackedUp,
          createdAt: item.createdAt,
        })),
        recentlyAuthenticated: recentUntil.getTime() > Date.now(),
        recentAuthUntil: recentUntil,
      },
    };
  });

  app.delete('/v1/me/google', async (request, reply) => {
    const actor = requireRecentAuth(request);
    await prisma.$transaction(async (tx) => {
      const removed = await tx.account.deleteMany({
        where: { userId: actor.id, provider: 'google' },
      });
      if (removed.count === 0) throw notFound('Google connection');
      await assertAnotherMethod(tx, actor.id);
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'account.provider_unlinked',
        entityType: 'User',
        entityId: actor.id,
        requestId: request.id,
        metadata: { provider: 'google' },
      });
    });
    return reply.status(204).send();
  });

  app.delete<{ Params: { id: string } }>(
    '/v1/me/passkeys/:id',
    async (request, reply) => {
      const actor = requireRecentAuth(request);
      await prisma.$transaction(async (tx) => {
        const removed = await tx.authenticator.deleteMany({
          where: { userId: actor.id, credentialID: request.params.id },
        });
        if (removed.count === 0) throw notFound('Passkey');
        await assertAnotherMethod(tx, actor.id);
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'account.passkey_removed',
          entityType: 'User',
          entityId: actor.id,
          requestId: request.id,
        });
      });
      return reply.status(204).send();
    },
  );

  app.get('/v1/me/sessions', async (request) => {
    const actor = requireActor(request);
    const rows = await prisma.userSession.findMany({
      where: {
        userId: actor.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
      select: {
        id: true,
        method: true,
        deviceLabel: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });
    return {
      data: rows.map((row) => ({
        ...row,
        current: row.id === actor.sessionId,
      })),
      nextCursor: null,
    };
  });

  /** Signs out one session. Revoking the current session signs this browser out. */
  app.delete<{ Params: { id: string } }>(
    '/v1/me/sessions/:id',
    async (request, reply) => {
      const actor = requireActor(request);
      const result = await prisma.userSession.updateMany({
        where: { id: request.params.id, userId: actor.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) throw notFound('Session');
      await recordAudit(prisma, {
        actorId: actor.id,
        action: 'session.revoked',
        entityType: 'UserSession',
        entityId: request.params.id,
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );

  /** Signs out every other session; this one stays signed in. */
  app.post('/v1/me/sessions/revoke-others', async (request) => {
    const actor = requireActor(request);
    const result = await revokeSessions(prisma, actor.id, {
      except: actor.sessionId,
    });
    await recordAudit(prisma, {
      actorId: actor.id,
      action: 'session.revoked_others',
      entityType: 'User',
      entityId: actor.id,
      requestId: request.id,
      metadata: { count: result.count },
    });
    return { data: { revoked: result.count } };
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function assertAnotherMethod(tx: Tx, userId: string) {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      emailVerified: true,
      passwordHash: true,
      _count: { select: { accounts: true, authenticators: true } },
    },
  });
  const methods =
    (user.emailVerified ? 1 : 0) +
    (user.passwordHash ? 1 : 0) +
    user._count.accounts +
    user._count.authenticators;
  if (methods === 0)
    throw new AppError(
      409,
      'LAST_SIGN_IN_METHOD',
      'Keep at least one way to sign in.',
    );
}
