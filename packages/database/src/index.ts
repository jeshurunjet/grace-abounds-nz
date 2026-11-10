import { PrismaClient } from '@prisma/client';

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
