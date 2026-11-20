import { randomUUID } from 'node:crypto';
import { prisma, recordAudit, type Prisma } from '@grace-abounds/database';
import { STORAGE_REMOVE } from './assets.js';
import { AppError } from './errors.js';
import { lockAndRecheck, type Actor } from './identity.js';
import type { CheckedImage } from './profile-image.js';
import { getStorage, PUT_TIMEOUT_MS, type Storage } from './storage.js';

/*
 * Profile photos (Phase 5): private files served only to their owner
 * through the API (the gateway sends the signed-in person's identity).
 *
 * Saving is retry-safe and leaves nothing behind: the file is recorded
 * before it is uploaded (ProfilePhoto, confirmedAt null); confirming it
 * re-checks the session under the owner's security lock (so a revoked,
 * suspended or deleted account can't finish a save), then makes it the
 * account's photo and queues the previous one for removal, in one
 * transaction. A retried save simply replaces the earlier one. A file whose
 * save never finished is swept; replaced, removed and deleted accounts'
 * files are removed through the outbox; removed files are checked again
 * for a day in case a late upload brought one back.
 *
 * User.image holds /api/v1/me/photo/<id>, so sign-in sessions and avatars
 * show the saved photo after a session refresh. Nothing else may set it.
 */

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;

export const photoPath = (id: string) => `/api/v1/me/photo/${id}`;
const photoKey = (userId: string, id: string, extension: string) =>
  `avatars/${userId}/${id}.${extension}`;

/** Marks photos removed and queues their files for removal. */
async function discard(tx: Tx, keys: string[], now: Date, uploaded = false) {
  for (const key of keys) {
    const marked = await tx.profilePhoto.updateMany({
      where: { storageKey: key, removedAt: null },
      data: { removedAt: now },
    });
    if (marked.count || uploaded)
      await tx.outboxEvent.create({
        data: { topic: STORAGE_REMOVE, payload: { key } },
      });
  }
}

/** Removes every photo of an account (deletion, inside its transaction). */
export async function discardProfilePhotos(tx: Tx, userId: string, now: Date) {
  const rows = await tx.profilePhoto.findMany({
    where: { userId, removedAt: null },
    select: { storageKey: true },
  });
  await discard(
    tx,
    rows.map((row) => row.storageKey),
    now,
  );
  return rows.length;
}

/** Saves a checked image as the actor's photo; returns its path. */
export async function saveProfilePhoto(
  actor: Actor,
  image: CheckedImage,
  storage: Pick<Storage, 'put'>,
  options: { requestId?: string; afterUpload?: () => Promise<void> } = {},
) {
  const id = randomUUID();
  const key = photoKey(actor.id, id, image.extension);
  // Recorded before upload, by a still-valid session.
  await prisma.$transaction(async (tx) => {
    await lockAndRecheck(tx, actor);
    await tx.profilePhoto.create({
      data: {
        id,
        userId: actor.id,
        storageKey: key,
        contentType: image.contentType,
        size: image.bytes.length,
        width: image.width,
        height: image.height,
      },
    });
  });
  await storage.put(key, image.bytes, image.contentType);
  await options.afterUpload?.();
  try {
    await prisma.$transaction(async (tx) => {
      // The session must still be valid (not revoked, suspended, deleted).
      await lockAndRecheck(tx, actor);
      const now = new Date();
      // Claimed against the sweep: exactly one of them wins this record.
      const confirmed = await tx.profilePhoto.updateMany({
        where: { id, removedAt: null, confirmedAt: null },
        data: { confirmedAt: now },
      });
      if (!confirmed.count)
        throw new AppError(
          409,
          'PHOTO_ABANDONED',
          'This photo took too long to save. Try again.',
        );
      const previous = await tx.profilePhoto.findMany({
        where: {
          userId: actor.id,
          id: { not: id },
          removedAt: null,
          confirmedAt: { not: null },
        },
        select: { storageKey: true },
      });
      await discard(
        tx,
        previous.map((item) => item.storageKey),
        now,
      );
      await tx.user.update({
        where: { id: actor.id },
        data: { image: photoPath(id) },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'profile.photo_saved',
        entityType: 'User',
        entityId: actor.id,
        requestId: options.requestId,
        metadata: {
          photoId: id,
          size: image.bytes.length,
          width: image.width,
          height: image.height,
          type: image.contentType,
        },
      });
    });
  } catch (error) {
    // Not saved: this upload is surplus, remove it now.
    await prisma.$transaction((tx) => discard(tx, [key], new Date(), true));
    throw error;
  }
  return photoPath(id);
}

/** Removes the actor's photo (idempotent). */
export async function removeProfilePhoto(actor: Actor, requestId?: string) {
  await prisma.$transaction(async (tx) => {
    await lockAndRecheck(tx, actor);
    const removed = await discardProfilePhotos(tx, actor.id, new Date());
    await tx.user.update({
      where: { id: actor.id },
      data: { image: null },
    });
    if (removed)
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'profile.photo_removed',
        entityType: 'User',
        entityId: actor.id,
        requestId,
      });
  });
}

/** The owner's current photo (or null): only ever their own. */
export function ownPhoto(userId: string, id: string) {
  return prisma.profilePhoto.findFirst({
    where: { id, userId, removedAt: null, confirmedAt: { not: null } },
  });
}

/** Unconfirmed photos are swept once no upload for them can still land. */
export const PHOTO_SWEEP_GRACE_MS = PUT_TIMEOUT_MS + 5 * 60_000;

/**
 * Removes photo files whose save never finished, re-removes any removed
 * file a late upload brought back (for a day), then forgets old records.
 */
export async function sweepProfilePhotos(
  storage: Storage | null,
  now = new Date(),
) {
  const stale = await prisma.profilePhoto.findMany({
    where: {
      confirmedAt: null,
      removedAt: null,
      createdAt: { lt: new Date(now.getTime() - PHOTO_SWEEP_GRACE_MS) },
    },
    select: { storageKey: true },
  });
  let abandoned = 0;
  for (const { storageKey } of stale) {
    // Only if still unconfirmed: a save confirming meanwhile wins.
    const claimed = await prisma.$transaction(async (tx) => {
      const marked = await tx.profilePhoto.updateMany({
        where: { storageKey, removedAt: null, confirmedAt: null },
        data: { removedAt: now },
      });
      if (marked.count)
        await tx.outboxEvent.create({
          data: { topic: STORAGE_REMOVE, payload: { key: storageKey } },
        });
      return marked.count > 0;
    });
    if (claimed) abandoned++;
  }
  let reappeared = 0;
  if (storage) {
    const watched = await prisma.profilePhoto.findMany({
      where: {
        removedAt: {
          lt: new Date(now.getTime() - 5 * 60_000),
          gt: new Date(now.getTime() - DAY),
        },
      },
      select: { storageKey: true },
    });
    for (const { storageKey } of watched)
      if (await storage.head(storageKey)) {
        reappeared++;
        await prisma.outboxEvent.create({
          data: { topic: STORAGE_REMOVE, payload: { key: storageKey } },
        });
      }
  }
  const forgotten = await prisma.profilePhoto.deleteMany({
    where: { removedAt: { lte: new Date(now.getTime() - DAY) } },
  });
  return { abandoned, reappeared, forgotten: forgotten.count };
}

type Log = { warn: (object: object, message: string) => void };
/** Sweeps abandoned profile photo files every 15 minutes. */
export function startProfilePhotoCleanup(log: Log) {
  const sweep = () =>
    sweepProfilePhotos(getStorage()).catch((error) =>
      log.warn({ err: error }, 'Profile photo cleanup failed.'),
    );
  void sweep();
  const timer = setInterval(sweep, 15 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
