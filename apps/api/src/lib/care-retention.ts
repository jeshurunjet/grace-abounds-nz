import {
  APPOINTMENT_RETENTION_DAYS,
  PRAYER_RETENTION_MONTHS,
} from '@grace-abounds/validation';
import { prisma, recordAudit } from '@grace-abounds/database';
import { forgetNotifications } from './notifications.js';

/*
 * Approved care retention (owner decision 19 November 2026). The audit
 * entry records only how many were removed, never content or people.
 *
 * - A prayer request marked "Prayed for" is deleted 12 months after it was
 *   closed, with its Pastor notes, history and notifications (Phase 4A).
 *   Open requests are never age-deleted.
 * - An appointment that was completed, cancelled or declined is deleted 30
 *   days after that, with its notes, history and notifications, and never
 *   before its time has passed (Phase 4B). Requested, suggested and
 *   confirmed appointments are never age-deleted.
 */

export function prayerCutoff(now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - PRAYER_RETENTION_MONTHS);
  return cutoff;
}

export async function expirePrayers(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const due = await tx.prayerRequest.findMany({
      where: { status: 'PRAYED_FOR', closedAt: { lte: prayerCutoff(now) } },
      select: { id: true },
    });
    if (!due.length) return 0;
    const ids = due.map((row) => row.id);
    await forgetNotifications(tx, 'prayer', ids);
    // Notes and history go with the request (cascade).
    const removed = await tx.prayerRequest.deleteMany({
      where: { id: { in: ids }, status: 'PRAYED_FOR' },
    });
    await recordAudit(tx, {
      actorId: null,
      action: 'care.prayers_expired',
      entityType: 'prayer',
      entityId: 'retention',
      metadata: { count: removed.count },
    });
    return removed.count;
  });
}

export async function expireAppointments(now = new Date()) {
  const cutoff = new Date(
    now.getTime() - APPOINTMENT_RETENTION_DAYS * 86_400_000,
  );
  return prisma.$transaction(async (tx) => {
    const due = await tx.appointment.findMany({
      where: {
        status: { in: ['COMPLETED', 'CANCELLED', 'DECLINED'] },
        closedAt: { lte: cutoff },
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      },
      select: { id: true },
    });
    if (!due.length) return 0;
    const ids = due.map((row) => row.id);
    await forgetNotifications(tx, 'appointment', ids);
    const removed = await tx.appointment.deleteMany({
      where: {
        id: { in: ids },
        status: { in: ['COMPLETED', 'CANCELLED', 'DECLINED'] },
      },
    });
    await recordAudit(tx, {
      actorId: null,
      action: 'care.appointments_expired',
      entityType: 'appointment',
      entityId: 'retention',
      metadata: { count: removed.count },
    });
    return removed.count;
  });
}

/** Runs in the API process: at start, then every 6 hours. */
export function startCareRetention(log: {
  warn: (object: object, message: string) => void;
}) {
  const run = () =>
    Promise.all([expirePrayers(), expireAppointments()]).catch((error) =>
      log.warn(
        { error: String((error as Error)?.message ?? error) },
        'Care retention run failed; it will run again.',
      ),
    );
  void run();
  const timer = setInterval(() => void run(), 6 * 60 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
