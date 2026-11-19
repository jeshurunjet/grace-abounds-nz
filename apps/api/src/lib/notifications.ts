import { prisma, Prisma } from '@grace-abounds/database';
import type { AppNotification } from '@grace-abounds/validation';

/*
 * Durable in-app notifications (Phase 4A). A notification is written in
 * the same transaction as the change it reports, so it exists exactly when
 * that change committed; its dedupe key makes it once per transition and
 * recipient, even if the write is retried. Text is generic: never prayer
 * text or other confidential details. Notifications about a record are
 * removed with that record (see care retention).
 */

type Tx = Prisma.TransactionClient;

export type NotificationInput = {
  userIds: string[];
  kind: string;
  title: string;
  body: string;
  href: string;
  entityType: string;
  entityId: string;
  /** Names the transition; combined with each recipient. */
  dedupe: string;
};

export async function notify(tx: Tx, input: NotificationInput) {
  const { userIds, dedupe, ...rest } = input;
  if (!userIds.length) return;
  await tx.notification.createMany({
    data: [...new Set(userIds)].map((userId) => ({
      ...rest,
      userId,
      dedupeKey: `${dedupe}:${userId}`,
    })),
    skipDuplicates: true,
  });
}

/** Removes every notification about these records (when they expire). */
export function forgetNotifications(
  tx: Tx,
  entityType: string,
  entityIds: string[],
) {
  return tx.notification.deleteMany({
    where: { entityType, entityId: { in: entityIds } },
  });
}

export const toNotification = (row: {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  createdAt: Date;
  readAt: Date | null;
}): AppNotification => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  href: row.href,
  createdAt: row.createdAt.toISOString(),
  read: !!row.readAt,
});

/** The active Pastor accounts (there is one fixed Pastor). */
export async function pastorIds(tx: Tx | typeof prisma = prisma) {
  const rows = await tx.user.findMany({
    where: { role: 'PASTOR', status: 'ACTIVE' },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
