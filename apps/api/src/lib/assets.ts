import { prisma, Prisma, Role, type Asset } from '@grace-abounds/database';
import {
  fileHref,
  type StaffAsset,
  type UploadPurpose,
} from '@grace-abounds/validation';
import type { Actor } from './identity.js';
import type { OutboxHandler } from './outbox.js';
import { getStorage } from './storage.js';

/*
 * Stored files (Phase 2D): what staff see, who may open a file, what refers
 * to it, and removing it. A file's access comes only from what refers to it,
 * so a sermon recording stays staff-only until the Pastor approves the
 * sermon, and a library file follows its resource's status and visibility.
 */

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

/** Outbox topic: delete a stored object after the database change commits. */
export const STORAGE_REMOVE = 'storage.remove';

export const staffAsset = (row: Asset): StaffAsset => ({
  id: row.id,
  fileName: row.fileName,
  size: Number(row.size),
  contentType: row.contentType,
  purpose: row.purpose as UploadPurpose,
  inline: row.inline,
  status: row.status.toLowerCase() as StaffAsset['status'],
  rejectReason: row.rejectReason,
  href: fileHref(row.id),
  createdAt: row.createdAt.toISOString(),
});

const isStaff = (actor: Actor | null) =>
  !!actor && (actor.role === Role.PASTOR || actor.role === Role.ADMIN);

/** Is the file the recording of a sermon that is approved and live? */
async function liveRecording(client: Client, id: string) {
  const rows = await client.$queryRaw<{ found: number }[]>`
    SELECT 1 AS found FROM "Sermon"
    WHERE "archivedAt" IS NULL AND "liveVersion" IS NOT NULL
      AND live->>'mediaAssetId' = ${id}
    LIMIT 1`;
  return rows.length > 0;
}

/**
 * Who may open a verified file: staff always; anyone for a live sermon's
 * recording or a published public resource; signed-in people for a
 * published members resource. Everything else is not found.
 */
export async function fileAccess(
  asset: Asset,
  actor: Actor | null,
): Promise<'open' | 'sign-in' | 'none'> {
  if (asset.status !== 'VERIFIED') return 'none';
  if (isStaff(actor)) return 'open';
  if (asset.purpose === 'sermon')
    return (await liveRecording(prisma, asset.id)) ? 'open' : 'none';
  const resources = await prisma.resource.findMany({
    where: { assetId: asset.id, status: 'PUBLISHED' },
    select: { visibility: true },
  });
  if (resources.some((row) => row.visibility === 'PUBLIC')) return 'open';
  if (resources.length) return actor ? 'open' : 'sign-in';
  return 'none';
}

/** How many things refer to a file, approved sermon copies included. */
export async function assetReferences(client: Client, id: string) {
  const resources = await client.resource.count({ where: { assetId: id } });
  const sermons = await client.sermon.count({ where: { mediaAssetId: id } });
  const live = await client.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM "Sermon"
    WHERE live->>'mediaAssetId' = ${id}`;
  return resources + sermons + Number(live[0]?.count ?? 0);
}

/**
 * Deletes a file's record and queues removal of the stored object, which
 * happens after the transaction commits (the bucket keeps a recoverable
 * version for 30 days).
 */
export async function removeAsset(tx: Tx, asset: Asset) {
  await tx.asset.delete({ where: { id: asset.id } });
  await tx.outboxEvent.create({
    data: { topic: STORAGE_REMOVE, payload: { key: asset.storageKey } },
  });
}

/** Outbox handler: removes stored objects queued by removeAsset. */
export function storageRemover(): OutboxHandler {
  return async (events) => {
    const storage = getStorage();
    if (!storage) throw new Error('File storage is not configured.');
    for (const event of events) {
      const key = (event.payload as { key?: unknown } | null)?.key;
      if (typeof key === 'string' && /^(incoming|files)\//.test(key))
        await storage.remove(key);
    }
  };
}

/**
 * A verified file that may be attached to a library resource or a sermon:
 * refuses anything missing, unchecked or meant for the other place.
 */
export async function usableAsset(
  client: Client,
  id: string,
  purpose: UploadPurpose,
): Promise<string | null> {
  const asset = await client.asset.findUnique({ where: { id } });
  if (!asset || asset.status !== 'VERIFIED')
    return 'That upload isn’t available. Upload the file again.';
  if (asset.purpose !== purpose)
    return purpose === 'sermon'
      ? 'Upload the recording here in Sermons & videos.'
      : 'Sermon recordings can’t be added to the library.';
  return null;
}
