import { prisma, Prisma } from '@grace-abounds/database';
import type { AppNotification } from '@grace-abounds/validation';
import { forgetDeliveries, queueEmails } from './email-delivery.js';

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
  const recipients = [...new Set(userIds)];
  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      ...rest,
      userId,
      dedupeKey: `${dedupe}:${userId}`,
    })),
    skipDuplicates: true,
  });
  // Optional email copies for those who chose them (Phase 5A).
  await queueEmails(tx, { userIds: recipients, kind: rest.kind, dedupe });
}

/**
 * Removes every notification about these records (when they expire), with
 * their email delivery records.
 */
export async function forgetNotifications(
  tx: Tx,
  entityType: string,
  entityIds: string[],
) {
  if (!entityIds.length) return { count: 0 };
  const rows = await tx.notification.findMany({
    where: { entityType, entityId: { in: entityIds } },
    select: { dedupeKey: true },
  });
  await forgetDeliveries(
    tx,
    rows.map((row) => row.dedupeKey),
  );
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
