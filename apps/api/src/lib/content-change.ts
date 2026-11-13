import type { Prisma } from '@grace-abounds/database';

/** Outbox topic for any change that can affect published website content. */
export const CONTENT_CHANGED = 'content.changed';

/**
 * Records, in the same transaction as the save, that published content may
 * have changed. The outbox is the durable source for cache invalidation and
 * for the public freshness stamp; a rolled-back save leaves no event.
 */
export function recordContentChange(
  tx: Prisma.TransactionClient,
  entityType: string,
  entityKey: string,
  version: number | null,
) {
  return tx.outboxEvent.create({
    data: {
      topic: CONTENT_CHANGED,
      payload: { entityType, entityKey, version },
    },
  });
}
