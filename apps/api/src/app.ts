import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '@grace-abounds/database';
import { registerErrorHandling } from './lib/errors.js';
import { registerIdentity } from './lib/identity.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerCollectionRoutes } from './routes/collections.js';
import { registerContentRoutes } from './routes/content.js';
import { registerSermonRoutes } from './routes/sermons.js';
import { registerRevisionRoutes } from './routes/revisions.js';
import { registerMeRoutes } from './routes/me.js';
import { registerStaffMemberRoutes } from './routes/staff-members.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { registerActivityRoutes } from './routes/activities.js';
import { registerParticipationRoutes } from './routes/participation.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import { registerCareRoutes } from './routes/care.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerAppointmentRoutes } from './routes/appointments.js';

const UUID = /^[0-9a-f-]{36}$/i;

export function buildApp() {
  const app = Fastify({
    logger: {
      // Never log credentials or identity assertions.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && UUID.test(incoming)
        ? incoming
        : randomUUID();
    },
    bodyLimit: 1_048_576,
  });
  registerErrorHandling(app);

  // Liveness and readiness (database reachable).
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'database-unavailable' });
    }
  });

  registerIdentity(app);
  registerMeRoutes(app);
  registerAccountRoutes(app);
  registerContentRoutes(app);
  registerSermonRoutes(app);
  registerRevisionRoutes(app);
  registerCollectionRoutes(app);
  registerStaffMemberRoutes(app);
  registerUploadRoutes(app);
  registerActivityRoutes(app);
  registerParticipationRoutes(app);
  registerCalendarRoutes(app);
  registerCareRoutes(app);
  registerNotificationRoutes(app);
  registerAppointmentRoutes(app);
  return app;
}
