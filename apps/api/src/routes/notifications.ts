import type { FastifyInstance } from 'fastify';
import type { NotificationList } from '@grace-abounds/validation';
import { prisma, recordAudit } from '@grace-abounds/database';
import { notFound } from '../lib/errors.js';
import { requireActor } from '../lib/identity.js';
import { toNotification } from '../lib/notifications.js';

/*
 * The signed-in person's own notifications (Phase 4A).
 *
 *   GET  /v1/me/notifications            latest 30 and the unread count
 *   POST /v1/me/notifications/:id/read   mark one read (own only; repeatable)
 *   POST /v1/me/notifications/read-all   mark all read
 */

const LATEST = 30;

async function list(userId: string): Promise<NotificationList> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: LATEST,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items: rows.map(toNotification), unread };
}

export function registerNotificationRoutes(app: FastifyInstance) {
  app.get('/v1/me/notifications', async (request, reply) => {
    const actor = requireActor(request);
    reply.header('cache-control', 'private, no-store');
    return { data: await list(actor.id) };
  });

  app.post<{ Params: { id: string } }>(
    '/v1/me/notifications/:id/read',
    async (request, reply) => {
      const actor = requireActor(request);
      const own = await prisma.notification.findFirst({
        where: { id: request.params.id, userId: actor.id },
        select: { id: true, readAt: true },
      });
      // Someone else's notification is not found.
      if (!own) throw notFound('Notification');
      if (!own.readAt)
        await prisma.notification.updateMany({
          where: { id: own.id, readAt: null },
          data: { readAt: new Date() },
        });
      reply.header('cache-control', 'private, no-store');
      return { data: await list(actor.id) };
    },
  );

  app.post('/v1/me/notifications/read-all', async (request, reply) => {
    const actor = requireActor(request);
    const marked = await prisma.notification.updateMany({
      where: { userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (marked.count)
      await recordAudit(prisma, {
        actorId: actor.id,
        action: 'notifications.read_all',
        entityType: 'user',
        entityId: actor.id,
        requestId: request.id,
        metadata: { count: marked.count },
      });
    reply.header('cache-control', 'private, no-store');
    return { data: await list(actor.id) };
  });
}
