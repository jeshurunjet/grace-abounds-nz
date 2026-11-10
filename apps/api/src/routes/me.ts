import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, recordAudit } from '@grace-abounds/database';
import { parse, requireVersion, versionConflict } from '../lib/errors.js';
import { requireActor } from '../lib/identity.js';

const profileSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  bio: true,
  role: true,
  status: true,
  createdAt: true,
  version: true,
} as const;

const profilePatch = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(80),
    bio: z.string().trim().max(1000),
    image: z
      .string()
      .trim()
      .max(500)
      .regex(/^(https:\/\/|\/)/, 'Use an HTTPS URL or a site path.')
      .nullable(),
  })
  .partial()
  .strict();

export function registerMeRoutes(app: FastifyInstance) {
  app.get('/v1/me', async (request, reply) => {
    const actor = requireActor(request);
    const { version, ...data } = await prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: profileSelect,
    });
    reply.header('etag', `"${version}"`);
    return { data, version };
  });

  app.patch('/v1/me', async (request, reply) => {
    const actor = requireActor(request);
    const expected = requireVersion(request.headers['if-match']);
    const changes = parse(profilePatch, request.body ?? {});
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id: actor.id, version: expected },
        data: { ...changes, version: { increment: 1 } },
      });
      if (result.count === 0) throw versionConflict();
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'profile.updated',
        entityType: 'User',
        entityId: actor.id,
        requestId: request.id,
        metadata: { fields: Object.keys(changes) },
      });
      return tx.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: profileSelect,
      });
    });
    const { version, ...data } = updated;
    reply.header('etag', `"${version}"`);
    return { data, version };
  });
}
