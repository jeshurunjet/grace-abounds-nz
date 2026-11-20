import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, recordAudit } from '@grace-abounds/database';
import { profilePhotoInputSchema } from '@grace-abounds/validation';
import {
  AppError,
  notFound,
  parse,
  requireVersion,
  versionConflict,
} from '../lib/errors.js';
import { requireActor } from '../lib/identity.js';
import { checkProfileImage } from '../lib/profile-image.js';
import {
  ownPhoto,
  removeProfilePhoto,
  saveProfilePhoto,
} from '../lib/profile-photo.js';
import { requireStorage, stored } from '../lib/storage.js';

const profileSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  bio: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  version: true,
} as const;

const profilePatch = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(80),
    bio: z.string().trim().max(1000),
    phone: z
      .string()
      .trim()
      .max(40)
      .regex(/^[+()0-9 .-]*$/, 'Use digits, spaces and + ( ) - only.'),
  })
  .partial()
  .strict();
// The photo is not part of this patch: it changes only through the photo
// routes below, so no one can point their profile at another person's file
// or an arbitrary address.

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

  /*
   * Own profile photo (Phase 5). The cropped image arrives as a data URL;
   * the server checks the bytes (type, size, dimensions), drops metadata
   * and stores a private copy. Only its owner can read it.
   *
   *   PUT    /v1/me/photo      save (replaces the current one)
   *   DELETE /v1/me/photo      remove
   *   GET    /v1/me/photo/:id  the image, to its owner only
   */
  app.put('/v1/me/photo', { bodyLimit: 1_048_576 }, async (request, reply) => {
    const actor = requireActor(request);
    const { image } = parse(profilePhotoInputSchema, request.body ?? {});
    const storage = requireStorage();
    const bytes = new Uint8Array(
      Buffer.from(image.slice(image.indexOf(',') + 1), 'base64'),
    );
    const checked = checkProfileImage(bytes);
    if (typeof checked === 'string')
      throw new AppError(422, 'VALIDATION_FAILED', checked, {
        image: checked,
      });
    const path = await saveProfilePhoto(
      actor,
      checked,
      {
        // Only the upload is a storage call (a 502 if storage is down).
        put: (key, body, type) =>
          stored(request.log, () => storage.put(key, body, type)),
      },
      { requestId: request.id },
    );
    reply.header('cache-control', 'private, no-store');
    return { data: { image: path } };
  });

  app.delete('/v1/me/photo', async (request, reply) => {
    const actor = requireActor(request);
    await removeProfilePhoto(actor, request.id);
    return reply.status(204).send();
  });

  app.get<{ Params: { id: string } }>(
    '/v1/me/photo/:id',
    async (request, reply) => {
      const actor = requireActor(request);
      const photo = await ownPhoto(actor.id, request.params.id);
      if (!photo) throw notFound('Photo');
      const storage = requireStorage();
      const bytes = await stored(request.log, () =>
        storage.readRange(photo.storageKey, 0, photo.size),
      );
      return reply
        .header('content-type', photo.contentType)
        .header('content-disposition', 'inline')
        .header('cache-control', 'private, no-store')
        .header('x-content-type-options', 'nosniff')
        .send(Buffer.from(bytes));
    },
  );
}
