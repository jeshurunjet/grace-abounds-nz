import { prisma, type Prisma } from '@grace-abounds/database';

/** Outbox topic for any change that can affect published website content. */
export const CONTENT_CHANGED = 'content.changed';

/**
 * Records, in the same transaction as the save, that published content may
 * have changed:
 * - increments the content generation. The update locks the single
 *   generation row until this transaction ends, so a second writer waits
 *   and gets the next number: generations follow commit order, and a
 *   reader can never see a later generation without the earlier change;
 * - writes the outbox event that later clears cached public content.
 * A rolled-back save leaves neither. Returns the new generation.
 */
export async function recordContentChange(
  tx: Prisma.TransactionClient,
  entityType: string,
  entityKey: string,
  version: number | null,
) {
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "ContentGeneration" (id, value) VALUES ('content', 1)
    ON CONFLICT (id) DO UPDATE SET value = "ContentGeneration".value + 1
    RETURNING value`;
  const generation = Number(row!.value);
  await tx.outboxEvent.create({
    data: {
      topic: CONTENT_CHANGED,
      payload: { entityType, entityKey, version, generation },
    },
  });
  return generation;
}

/** The latest committed content generation (0 before the first change). */
export async function contentGeneration(
  client: Pick<typeof prisma, 'contentGeneration'> = prisma,
) {
  const row = await client.contentGeneration.findUnique({
    where: { id: 'content' },
  });
  return row?.value ?? 0;
}
