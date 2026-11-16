import type { Prisma } from '@grace-abounds/database';

/** Outbox topic: an activity's public Google Calendar events need updating. */
export const CALENDAR_SYNC = 'calendar.sync';

/**
 * Called in the same transaction as an activity change (save, date change,
 * restore, delete), so the request to update Google can't be lost and
 * never runs for a change that rolled back (Phase 3C).
 */
export async function queueCalendarSync(
  tx: Prisma.TransactionClient,
  activityId: string,
) {
  await tx.outboxEvent.create({
    data: { topic: CALENDAR_SYNC, payload: { activityId } },
  });
}
