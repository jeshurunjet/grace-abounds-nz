import { PrismaClient, type Prisma, type Role } from '@prisma/client';

export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** One Prisma client per process (reused across Next.js hot reloads). */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type AuditInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
};

type AuditClient = Pick<PrismaClient, 'auditEvent'>;

/** Records an audit event, inside the caller's transaction when given one. */
export function recordAudit(client: AuditClient, input: AuditInput) {
  return client.auditEvent.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.requestId ?? null,
      metadata: (input.metadata ?? undefined) as never,
    },
  });
}

// ---------- Identity helpers (shared by web and API) ----------

type Client = PrismaClient | Prisma.TransactionClient;

/** Absolute session lifetime; the Auth.js cookie uses the same value. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** Sensitive account changes need a sign-in or re-authentication this recent. */
export const RECENT_AUTH_MS = 10 * 60 * 1000;
/** last-seen is written at most this often per session. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export type SessionClaims = {
  userId: string;
  sessionId: string;
  sessionVersion: number;
};

/**
 * Loads a session only if it is still valid: it belongs to the user, is not
 * revoked or expired, matches the user's current sessionVersion, and the
 * account is active. Returns null otherwise. Used by both the website
 * (every auth() call) and the API (every request).
 */
export async function loadActiveSession(client: Client, claims: SessionClaims) {
  if (
    !claims.userId ||
    !claims.sessionId ||
    !Number.isInteger(claims.sessionVersion)
  )
    return null;
  const row = await client.userSession.findUnique({
    where: { id: claims.sessionId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
          status: true,
          sessionVersion: true,
        },
      },
    },
  });
  const now = Date.now();
  if (
    !row ||
    row.userId !== claims.userId ||
    row.revokedAt ||
    row.expiresAt.getTime() <= now ||
    row.user.status !== 'ACTIVE' ||
    row.user.sessionVersion !== claims.sessionVersion ||
    row.sessionVersion !== claims.sessionVersion
  )
    return null;
  if (now - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS)
    await client.userSession.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { lastSeenAt: new Date(now) },
    });
  return row;
}

export const isRecentlyAuthenticated = (authenticatedAt: Date) =>
  Date.now() - authenticatedAt.getTime() <= RECENT_AUTH_MS;

/** Ends one user's sessions, optionally keeping the current one. */
export function revokeSessions(
  client: Client,
  userId: string,
  options: { except?: string } = {},
) {
  return client.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(options.except && { id: { not: options.except } }),
    },
    data: { revokedAt: new Date() },
  });
}

/**
 * Atomic fixed-window counter in one statement, so concurrent requests can
 * never both pass the last slot. Returns true while the count is within max.
 */
export async function consumeAttempt(
  client: Client,
  key: string,
  max: number,
  windowMs: number,
) {
  const seconds = windowMs / 1000;
  const rows = await client.$queryRaw<{ count: number }[]>`
    INSERT INTO "AuthAttempt" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "AuthAttempt"."windowStart" <= now() - make_interval(secs => ${seconds}::double precision)
        THEN 1 ELSE "AuthAttempt"."count" + 1 END,
      "windowStart" = CASE
        WHEN "AuthAttempt"."windowStart" <= now() - make_interval(secs => ${seconds}::double precision)
        THEN now() ELSE "AuthAttempt"."windowStart" END
    RETURNING "count"`;
  return Number(rows[0]?.count ?? Infinity) <= max;
}

export const resetAttempts = (client: Client, key: string) =>
  client.authAttempt.deleteMany({ where: { key } });

/** Shared advisory-lock key for every change that can reduce active Pastors. */
const PASTOR_SET_LOCK = 7_204_101;

export class LastPastorError extends Error {
  constructor() {
    super('The last active Pastor cannot be removed, suspended or demoted.');
  }
}

/**
 * Call inside a transaction before changing any user's role, status or
 * deletion state. All such changes (API routes and the staff:add command)
 * take the same lock, so two concurrent changes cannot both remove the
 * last active Pastor. The lock is released when the transaction ends.
 */
export async function lockPastorSet(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PASTOR_SET_LOCK}::bigint)`;
}

/**
 * Throws LastPastorError if the change would leave no active Pastor.
 * Must run after lockPastorSet in the same transaction.
 */
export async function assertPastorRemains(
  tx: Prisma.TransactionClient,
  targetId: string,
  next: { role?: Role; status?: string },
) {
  const target = await tx.user.findUnique({
    where: { id: targetId },
    select: { role: true, status: true },
  });
  if (!target || target.role !== 'PASTOR' || target.status !== 'ACTIVE') return;
  const staysPastor =
    (next.role ?? target.role) === 'PASTOR' &&
    (next.status ?? target.status) === 'ACTIVE';
  if (staysPastor) return;
  const others = await tx.user.count({
    where: { role: 'PASTOR', status: 'ACTIVE', id: { not: targetId } },
  });
  if (others === 0) throw new LastPastorError();
}
