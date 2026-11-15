import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma, recordAudit, Role, type Asset } from '@grace-abounds/database';
import {
  decideStorage,
  MAX_LIBRARY_FILE_BYTES,
  MAX_SERMON_FILE_BYTES,
  partSizeFor,
  uploadCompleteSchema,
  uploadPartsSchema,
  uploadStartSchema,
  type UploadPurpose,
  type UploadsStatus,
} from '@grace-abounds/validation';
import { AppError, notFound, parse } from '../lib/errors.js';
import { requireRole, type Actor } from '../lib/identity.js';
import {
  assetReferences,
  fileAccess,
  removeAsset,
  staffAsset,
} from '../lib/assets.js';
import {
  getStorage,
  keySafeName,
  requireStorage,
  stored,
} from '../lib/storage.js';

/*
 * Verified uploads (Phase 2D). Pastor and Admin only; members never upload.
 *
 *   GET    /v1/staff/uploads/status        is storage configured, limits
 *   POST   /v1/staff/uploads               start: policy check, PENDING asset,
 *                                          S3 multipart upload in incoming/
 *   POST   /v1/staff/uploads/:id/parts     presigned URLs for some parts
 *   POST   /v1/staff/uploads/:id/complete  join parts, check size and first
 *                                          bytes, move to files/, VERIFIED
 *   GET    /v1/staff/uploads/:id           one upload (staff)
 *   DELETE /v1/staff/uploads/:id           cancel, or remove an unused file
 *   GET    /v1/files/:id                   open/download: redirect to a
 *                                          short-lived link if allowed
 *
 * The browser sends file bytes straight to S3 with single-part presigned
 * URLs; the API never handles file contents except the first 4 KB it reads
 * back to check the real type. Nothing in incoming/ is ever served.
 */

const PART_URL_SECONDS = 60 * 60;
/** A download starts at once, so a short link is enough. */
const DOWNLOAD_SECONDS = 5 * 60;
/**
 * Audio and video players keep requesting ranges while someone watches, and
 * S3 checks the link on every request, so playback links last a service.
 */
const PLAYBACK_SECONDS = 4 * 60 * 60;
const SNIFF_BYTES = 4096;

const partCountOf = (asset: Asset) =>
  Math.ceil(Number(asset.size) / partSizeFor(Number(asset.size)));
const finalKey = (asset: Asset) =>
  `files/${asset.purpose === 'sermon' ? 'sermons' : 'library'}/${asset.id}/${keySafeName(asset.fileName)}`;

export function registerUploadRoutes(app: FastifyInstance) {
  const staff = (request: FastifyRequest) =>
    requireRole(request, Role.PASTOR, Role.ADMIN);

  /** The caller's own upload that is still in progress. */
  async function ownPending(id: string, actor: Actor) {
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.ownerId !== actor.id) throw notFound('Upload');
    if (asset.status !== 'PENDING' || !asset.uploadId)
      throw new AppError(
        409,
        'UPLOAD_FINISHED',
        asset.status === 'VERIFIED'
          ? 'This file is already uploaded.'
          : 'This upload was stopped. Upload the file again.',
      );
    return asset as Asset & { uploadId: string };
  }

  app.get('/v1/staff/uploads/status', async (request, reply) => {
    staff(request);
    reply.header('cache-control', 'private, no-store');
    const data: UploadsStatus = {
      available: !!getStorage(),
      maxLibraryBytes: MAX_LIBRARY_FILE_BYTES,
      maxSermonBytes: MAX_SERMON_FILE_BYTES,
    };
    return { data };
  });

  app.post('/v1/staff/uploads', async (request, reply) => {
    const actor = staff(request);
    const storage = requireStorage();
    const input = parse(uploadStartSchema, request.body ?? {});
    const asset = await prisma.asset.create({
      data: {
        storageKey: `incoming/${randomUUID()}`,
        fileName: input.fileName,
        contentType: 'application/octet-stream',
        size: BigInt(input.size),
        purpose: input.purpose,
        ownerId: actor.id,
      },
    });
    let uploadId: string;
    try {
      uploadId = await stored(request.log, () =>
        storage.createMultipart(asset.storageKey),
      );
    } catch (error) {
      await prisma.asset.delete({ where: { id: asset.id } });
      throw error;
    }
    const started = await prisma.asset.update({
      where: { id: asset.id },
      data: { uploadId },
    });
    reply.status(201).header('cache-control', 'private, no-store');
    const partSize = partSizeFor(input.size);
    return {
      data: {
        asset: staffAsset(started),
        partSize,
        partCount: Math.ceil(input.size / partSize),
      },
    };
  });

  app.post<{ Params: { id: string } }>(
    '/v1/staff/uploads/:id/parts',
    async (request, reply) => {
      const actor = staff(request);
      const storage = requireStorage();
      const { partNumbers } = parse(uploadPartsSchema, request.body ?? {});
      const asset = await ownPending(request.params.id, actor);
      const count = partCountOf(asset);
      if (partNumbers.some((n) => n > count))
        throw new AppError(
          422,
          'VALIDATION_FAILED',
          'Some fields need attention.',
          {
            partNumbers: `This file has ${count} parts.`,
          },
        );
      const urls = await stored(request.log, () =>
        storage.partUrls(
          asset.storageKey,
          asset.uploadId,
          [...new Set(partNumbers)],
          PART_URL_SECONDS,
        ),
      );
      reply.header('cache-control', 'private, no-store');
      return { data: { urls } };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/staff/uploads/:id/complete',
    async (request, reply) => {
      const actor = staff(request);
      const storage = requireStorage();
      const { parts } = parse(uploadCompleteSchema, request.body ?? {});
      const asset = await ownPending(request.params.id, actor);
      const count = partCountOf(asset);
      const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
      if (
        sorted.length !== count ||
        sorted.some((part, index) => part.partNumber !== index + 1)
      )
        throw new AppError(
          409,
          'UPLOAD_INCOMPLETE',
          'Some of the file hasn’t arrived yet. Retry the upload.',
        );

      // Joining the parts is skipped when an earlier attempt already did
      // it (the check below failed afterwards), so Retry is always safe.
      if (!(await stored(request.log, () => storage.head(asset.storageKey))))
        try {
          await storage.completeMultipart(
            asset.storageKey,
            asset.uploadId,
            sorted,
          );
        } catch (error) {
          request.log.warn(
            { storageError: (error as Error)?.name ?? 'Error' },
            'Completing an upload failed.',
          );
          // Parts can be sent again while the multipart upload exists.
          throw new AppError(
            409,
            'UPLOAD_INCOMPLETE',
            'Some of the file didn’t arrive. Retry the upload.',
          );
        }

      /** Refuses the file: removes what arrived and records why. */
      const reject = async (reason: string) => {
        await stored(request.log, () => storage.remove(asset.storageKey)).catch(
          () => undefined, // incoming/ also expires after 2 days.
        );
        await prisma.$transaction(async (tx) => {
          await tx.asset.update({
            where: { id: asset.id },
            data: { status: 'REJECTED', rejectReason: reason, uploadId: null },
          });
          await recordAudit(tx, {
            actorId: actor.id,
            action: 'files.upload_rejected',
            entityType: 'asset',
            entityId: asset.id,
            requestId: request.id,
            metadata: {
              fileName: asset.fileName,
              size: Number(asset.size),
              purpose: asset.purpose,
              reason,
            },
          });
        });
        throw new AppError(422, 'FILE_REJECTED', reason, { file: reason });
      };

      const head = await stored(request.log, () =>
        storage.head(asset.storageKey),
      );
      if (!head || head.size !== Number(asset.size))
        return reject(
          'The file that arrived isn’t the size expected. Upload it again.',
        );
      const start = await stored(request.log, () =>
        storage.readStart(asset.storageKey, SNIFF_BYTES),
      );
      const decision = decideStorage({
        fileName: asset.fileName,
        purpose: asset.purpose as UploadPurpose,
        head: start,
      });
      if (!decision.ok) return reject(decision.reason);

      const key = finalKey(asset);
      await stored(request.log, () =>
        storage.copy(asset.storageKey, key, decision.contentType),
      );
      const verified = await prisma.$transaction(async (tx) => {
        const result = await tx.asset.updateMany({
          where: { id: asset.id, status: 'PENDING' },
          data: {
            status: 'VERIFIED',
            storageKey: key,
            contentType: decision.contentType,
            inline: decision.inline,
            uploadId: null,
            verifiedAt: new Date(),
          },
        });
        if (result.count === 0)
          throw new AppError(
            409,
            'UPLOAD_FINISHED',
            'This upload was finished or stopped elsewhere.',
          );
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'files.upload_verified',
          entityType: 'asset',
          entityId: asset.id,
          requestId: request.id,
          metadata: {
            fileName: asset.fileName,
            size: Number(asset.size),
            purpose: asset.purpose,
            contentType: decision.contentType,
          },
        });
        return (await tx.asset.findUnique({ where: { id: asset.id } }))!;
      });
      // The checked copy is in files/; the unchecked one is no longer needed.
      await stored(request.log, () => storage.remove(asset.storageKey)).catch(
        () => undefined, // incoming/ also expires after 2 days.
      );
      reply.header('cache-control', 'private, no-store');
      return { data: staffAsset(verified) };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/v1/staff/uploads/:id',
    async (request, reply) => {
      staff(request);
      const asset = await prisma.asset.findUnique({
        where: { id: request.params.id },
      });
      if (!asset) throw notFound('Upload');
      reply.header('cache-control', 'private, no-store');
      return { data: staffAsset(asset) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/staff/uploads/:id',
    async (request, reply) => {
      const actor = staff(request);
      const asset = await prisma.asset.findUnique({
        where: { id: request.params.id },
      });
      if (!asset) throw notFound('Upload');
      if (asset.status === 'PENDING' && asset.uploadId) {
        const storage = requireStorage();
        await stored(request.log, () =>
          storage.abortMultipart(asset.storageKey, asset.uploadId!),
        );
      }
      const inUse = () =>
        new AppError(
          409,
          'IN_USE',
          'This file is in use. Remove it from the library item or sermon first.',
        );
      await prisma
        .$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${asset.id} FOR UPDATE`;
          if (await assetReferences(tx, asset.id)) throw inUse();
          if (asset.status === 'VERIFIED') await removeAsset(tx, asset);
          else await tx.asset.delete({ where: { id: asset.id } });
          await recordAudit(tx, {
            actorId: actor.id,
            action:
              asset.status === 'VERIFIED'
                ? 'files.file_deleted'
                : 'files.upload_cancelled',
            entityType: 'asset',
            entityId: asset.id,
            requestId: request.id,
            metadata: {
              fileName: asset.fileName,
              size: Number(asset.size),
              purpose: asset.purpose,
            },
          });
        })
        .catch((error: unknown) => {
          // Something attached it after the check (the foreign key holds).
          if ((error as { code?: string }).code === 'P2003') throw inUse();
          throw error;
        });
      reply.header('cache-control', 'private, no-store');
      return reply.status(204).send();
    },
  );

  app.get<{ Params: { id: string }; Querystring: { download?: string } }>(
    '/v1/files/:id',
    async (request, reply) => {
      const asset = await prisma.asset.findUnique({
        where: { id: request.params.id },
      });
      // Missing, unchecked and private files all look the same.
      if (!asset) throw notFound('File');
      const access = await fileAccess(asset, request.actor);
      if (access === 'sign-in')
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Please sign in to open this file.',
        );
      if (access !== 'open') throw notFound('File');
      const storage = requireStorage();
      const inline = asset.inline && request.query.download === undefined;
      const playback = inline && /^(audio|video)\//.test(asset.contentType);
      const url = await stored(request.log, () =>
        storage.downloadUrl(asset.storageKey, {
          fileName: asset.fileName,
          contentType: asset.inline
            ? asset.contentType
            : 'application/octet-stream',
          disposition: inline ? 'inline' : 'attachment',
          expiresIn: playback ? PLAYBACK_SECONDS : DOWNLOAD_SECONDS,
        }),
      );
      reply.header('cache-control', 'private, no-store');
      reply.header('referrer-policy', 'no-referrer');
      return reply.redirect(url, 302);
    },
  );
}
