import {
  lockPastorSet,
  lockUserSecurity,
  prisma,
  recordAudit,
  revokeSessions,
  Role,
} from '@grace-abounds/database';
import {
  appointmentDeleteAfter,
  AUDIT_RETENTION_DAYS,
  DELETION_RETENTION_DAYS,
  nzNow,
  type DeletionInfo,
} from '@grace-abounds/validation';
import { AppError, forbidden, notFound } from './errors.js';
import { lockAndRecheck, type Actor } from './identity.js';
import { endAccountExports } from './data-export.js';
import { forgetNotifications } from './notifications.js';
import { emailSender, type SendEmail } from './email.js';
import type { OutboxHandler } from './outbox.js';
import { lockActivity } from '../routes/activities.js';
import { tellStaff } from '../routes/appointments.js';

/*
 * Member account deletion (Phase 5C), following the owner's policy:
 *
 * - No grace period. After a recent sign-in and typing DELETE (or staff
 *   acting at the member's recorded request), one transaction removes
 *   access at once: sessions revoked, sign-in blocked (status
 *   DELETION_PENDING), credentials deleted, email/name/phone/bio cleared,
 *   upcoming bookings cancelled (places released under each activity's
 *   lock), open appointments closed (staff told, generically), data exports
 *   ended (files removed by the accepted cleanup), the person's own
 *   notifications and email choices removed. A mandatory notice is sent to
 *   the old address through the outbox (not an optional update email).
 * - What remains (prayers, appointment history with notes, booking
 *   history) is labelled "Deleted user" and purged after 30 days, together
 *   with the account row; later if one of its appointments may not yet be
 *   removed under the approved appointment rule (30 days after closing, not
 *   before its scheduled time). The record's purgeAfter is that date. Church content is never touched: its author
 *   references are SET NULL; the audit log keeps content-free entries with
 *   the actor cleared.
 * - Fixed staff accounts (Pastor, Admin) can never be deleted here; staff
 *   may delete a member only when the member asked, with a note.
 * - The activity (audit) log is trimmed to a rolling year.
 *
 * Lock order (same everywhere): Pastor set, then user security locks, then
 * activity rows / export rows. Member writes (bookings, prayer and
 * appointment requests) take the member's security lock and re-check the
 * session first, so none can land after the deletion committed.
 *
 * REAL EXECUTION IS DISABLED. Until the owner has walked through it and the
 * remaining policy points are settled, every entry point here refuses to
 * run, outside the test suite. There is deliberately no environment
 * setting: only allowDeletionExecutionForTests (tests) switches it on.
 */

const DAY = 86_400_000;

let executionAllowed = false;
export const deletionExecutionAllowed = () => executionAllowed;
/** Tests only. Real servers never call this; there is no setting for it. */
export function allowDeletionExecutionForTests(allowed: boolean) {
  if (!process.env.VITEST)
    throw new Error('Account deletion can only be switched on in tests.');
  executionAllowed = allowed;
}
const unavailable = () =>
  new AppError(
    503,
    'DELETION_UNAVAILABLE',
    'Account deletion isn’t switched on yet. Contact the church office if you need your account removed.',
  );
export function requireDeletionAllowed() {
  if (!executionAllowed) throw unavailable();
}

export const staffProtected = () =>
  new AppError(403, 'STAFF_PROTECTED', 'Staff accounts can’t be deleted here.');

/** Outbox topic: the mandatory "your account was deleted" notice. */
export const ACCOUNT_NOTICE = 'account.notice';
/** Give up on the notice after this many provider attempts. */
export const NOTICE_MAX_ATTEMPTS = 6;

/** The address that replaces a deleted account's email (unique, inert). */
export const deletedEmail = (id: string) => `deleted+${id}@deleted.invalid`;

export const toDeletionInfo = (row: {
  via: string;
  requestedAt: Date;
  purgeAfter: Date;
  purgedAt: Date | null;
}): DeletionInfo => ({
  via: row.via === 'staff' ? 'staff' : 'self',
  requestedAt: row.requestedAt.toISOString(),
  purgeAfter: row.purgeAfter.toISOString(),
  purgedAt: row.purgedAt?.toISOString() ?? '',
});

type Request = {
  actor: Actor;
  targetId: string;
  via: 'self' | 'staff';
  requestNote?: string;
  requestId?: string;
  now?: Date;
};

/**
 * Removes a member's access and does the immediate follow-up, atomically.
 * Idempotent: a second request for an already-deleted account returns the
 * existing record without doing anything again.
 */
export async function deleteAccount(input: Request) {
  requireDeletionAllowed();
  const now = input.now ?? new Date();
  const { actor } = input;
  if (input.via === 'staff' && input.targetId === actor.id)
    throw staffProtected();
  return prisma.$transaction(
    async (tx) => {
      await lockPastorSet(tx);
      // The acting session must still be valid and recently signed in.
      await lockAndRecheck(tx, actor, { requireRecent: true });
      if (input.via === 'staff') {
        const self = await tx.user.findUnique({
          where: { id: actor.id },
          select: { role: true, status: true },
        });
        if (
          !self ||
          (self.role !== Role.PASTOR && self.role !== Role.ADMIN) ||
          self.status !== 'ACTIVE'
        )
          throw forbidden();
      }
      const existing = await tx.accountDeletion.findUnique({
        where: { userId: input.targetId },
      });
      if (existing) return { row: existing, created: false };
      const peek = await tx.user.findUnique({
        where: { id: input.targetId },
        select: { role: true },
      });
      if (!peek) throw notFound('Person');
      if (peek.role !== Role.MEMBER) throw staffProtected();
      if (input.via === 'staff') await lockUserSecurity(tx, input.targetId);
      const user = await tx.user.findUniqueOrThrow({
        where: { id: input.targetId },
      });
      if (user.role !== Role.MEMBER) throw staffProtected();
      if (user.status !== 'ACTIVE' && user.status !== 'SUSPENDED')
        throw new AppError(
          409,
          'ACCOUNT_LOCKED',
          'This account can’t be deleted here.',
        );

      // Upcoming bookings: cancelled, places released (activity locks).
      const today = nzNow(now).date;
      const upcoming = await tx.participation.findMany({
        where: {
          userId: user.id,
          status: 'ACTIVE',
          OR: [{ dateKey: '' }, { dateKey: { gte: today } }],
        },
        select: { id: true, activityId: true },
        orderBy: { activityId: 'asc' },
      });
      for (const activityId of [
        ...new Set(upcoming.map((row) => row.activityId)),
      ])
        await lockActivity(tx, activityId);
      let bookingsCancelled = 0;
      for (const row of upcoming) {
        const changed = await tx.participation.updateMany({
          where: { id: row.id, status: 'ACTIVE' },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        if (!changed.count) continue;
        bookingsCancelled++;
        await tx.participationEvent.create({
          data: {
            participationId: row.id,
            action: 'cancelled',
            actorId: actor.id,
          },
        });
      }

      // Open appointments: closed (cancelled); staff told, generically.
      const open = await tx.appointment.findMany({
        where: {
          userId: user.id,
          status: { in: ['REQUESTED', 'PROPOSED', 'CONFIRMED'] },
        },
        select: { id: true, version: true },
      });
      let appointmentsClosed = 0;
      for (const row of open) {
        const changed = await tx.appointment.updateMany({
          where: {
            id: row.id,
            status: { in: ['REQUESTED', 'PROPOSED', 'CONFIRMED'] },
          },
          data: {
            status: 'CANCELLED',
            closedAt: now,
            version: { increment: 1 },
          },
        });
        if (!changed.count) continue;
        appointmentsClosed++;
        const saved = await tx.appointment.findUniqueOrThrow({
          where: { id: row.id },
          select: { id: true, version: true, startsAt: true, endsAt: true },
        });
        await tx.appointmentEvent.create({
          data: {
            appointmentId: row.id,
            status: 'CANCELLED',
            startsAt: saved.startsAt,
            endsAt: saved.endsAt,
          },
        });
        await tellStaff(
          tx,
          saved,
          saved.version,
          actor.id,
          'An appointment was cancelled',
          'The member’s account was deleted.',
        );
      }

      const exportsEnded = await endAccountExports(tx, user.id, now);

      // The person's own updates and choices serve no one any more.
      await tx.emailDelivery.deleteMany({ where: { userId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.notificationPreference.deleteMany({
        where: { userId: user.id },
      });

      // Credentials and sign-in, then the direct identifiers.
      await tx.account.deleteMany({ where: { userId: user.id } });
      await tx.authenticator.deleteMany({ where: { userId: user.id } });
      await tx.authChallenge.deleteMany({
        where: { OR: [{ userId: user.id }, { email: user.email }] },
      });
      await tx.verificationToken.deleteMany({
        where: { identifier: user.email },
      });
      await revokeSessions(tx, user.id);
      await tx.user.update({
        where: { id: user.id },
        data: {
          status: 'DELETION_PENDING',
          sessionVersion: { increment: 1 },
          version: { increment: 1 },
          email: deletedEmail(user.id),
          emailVerified: null,
          name: null,
          image: null,
          phone: '',
          bio: '',
          passwordHash: null,
          passwordUpdatedAt: null,
        },
      });

      // At least 30 days, and never before any of the account's
      // appointments may be removed under the approved appointment rule
      // (30 days after closing, not before its scheduled time).
      const appointments = await tx.appointment.findMany({
        where: { userId: user.id },
        select: { closedAt: true, startsAt: true },
      });
      const purgeAfter = new Date(
        Math.max(
          now.getTime() + DELETION_RETENTION_DAYS * DAY,
          ...appointments.map((item) =>
            Date.parse(
              appointmentDeleteAfter(
                (item.closedAt ?? now).toISOString(),
                item.startsAt?.toISOString() ?? '',
              ),
            ),
          ),
        ),
      );
      const row = await tx.accountDeletion.create({
        data: {
          userId: user.id,
          via: input.via,
          requestedById: actor.id,
          requestNote: input.via === 'staff' ? (input.requestNote ?? '') : '',
          requestedAt: now,
          purgeAfter,
          noticeEmail: user.email,
        },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'account.deletion_requested',
        entityType: 'User',
        entityId: user.id,
        requestId: input.requestId,
        metadata: {
          via: input.via,
          bookingsCancelled,
          appointmentsClosed,
          exportsEnded,
        },
      });
      await tx.outboxEvent.create({
        data: { topic: ACCOUNT_NOTICE, payload: { deletionId: row.id } },
      });
      return { row, created: true };
    },
    { timeout: 30_000 },
  );
}

/**
 * Removes deleted accounts whose 30 days have passed: the account row and,
 * by cascade, everything kept for it (bookings and history, prayers and
 * appointments with notes and history, exports, sessions); staff
 * notifications about those records go too. Church content and audit
 * entries stay (references set null). Retry-safe and idempotent.
 */
export async function purgeDeletedAccounts(now = new Date(), limit = 20) {
  if (!executionAllowed) return { skipped: true as const, purged: 0 };
  const due = await prisma.accountDeletion.findMany({
    where: { stage: 'ACCESS_REMOVED', purgeAfter: { lte: now } },
    orderBy: { purgeAfter: 'asc' },
    take: limit,
  });
  let purged = 0;
  for (const deletion of due) {
    const done = await prisma.$transaction(async (tx) => {
      await lockUserSecurity(tx, deletion.userId);
      const current = await tx.accountDeletion.findUnique({
        where: { id: deletion.id },
      });
      if (!current || current.stage !== 'ACCESS_REMOVED') return false;
      const user = await tx.user.findUnique({
        where: { id: deletion.userId },
        select: { status: true, role: true },
      });
      if (user) {
        // Never anything but a deleted member account.
        if (user.status !== 'DELETION_PENDING' || user.role !== Role.MEMBER)
          return false;
        const prayers = await tx.prayerRequest.findMany({
          where: { userId: deletion.userId },
          select: { id: true },
        });
        const appointments = await tx.appointment.findMany({
          where: { userId: deletion.userId },
          select: { id: true },
        });
        await forgetNotifications(
          tx,
          'prayer',
          prayers.map((row) => row.id),
        );
        await forgetNotifications(
          tx,
          'appointment',
          appointments.map((row) => row.id),
        );
        await tx.user.delete({ where: { id: deletion.userId } });
      }
      await tx.accountDeletion.update({
        where: { id: deletion.id },
        data: {
          stage: 'PURGED',
          purgedAt: now,
          requestNote: '',
          noticeEmail: null,
        },
      });
      await recordAudit(tx, {
        actorId: null,
        action: 'account.deletion_purged',
        entityType: 'User',
        entityId: deletion.userId,
      });
      return true;
    });
    if (done) purged++;
  }
  return { skipped: false as const, purged };
}

/**
 * Trims the activity (audit) log to a rolling year, with purged deletion
 * records of the same age. Disabled with the rest of real execution.
 */
export async function trimAuditLog(now = new Date()) {
  if (!executionAllowed)
    return { skipped: true as const, events: 0, deletions: 0 };
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * DAY);
  const events = await prisma.auditEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  const deletions = await prisma.accountDeletion.deleteMany({
    where: { stage: 'PURGED', purgedAt: { lt: cutoff } },
  });
  return {
    skipped: false as const,
    events: events.count,
    deletions: deletions.count,
  };
}

/** The mandatory notice: always sent, whatever the update preferences. */
export function deletionNotice(
  via: string,
  requestedAt: Date,
  purgeAfter: Date,
) {
  const format = (value: Date) =>
    value.toLocaleDateString('en-NZ', {
      dateStyle: 'long',
      timeZone: 'Pacific/Auckland',
    });
  const day = format(requestedAt);
  const how =
    via === 'staff'
      ? 'Church staff deleted it on ' + day + ', as you asked.'
      : 'You deleted it on ' + day + '.';
  const lines = [
    'Your Grace Abounds account has been deleted.',
    how,
    'You have been signed out everywhere and can’t sign in again. Your upcoming bookings were cancelled and open appointments closed.',
    `Your remaining records are kept as “Deleted user” until ${format(purgeAfter)} and then removed for good. Copies may remain in secure backups until they are replaced.`,
    'If you didn’t ask for this, please contact the church office straight away.',
  ];
  return {
    subject: 'Your Grace Abounds account has been deleted',
    text: lines.join('\n\n'),
    html: lines.map((line) => `<p>${line}</p>`).join(''),
  };
}

/** Outbox handler: sends each deletion notice once; retries, then gives up. */
export function deletionNoticeSender(
  send: SendEmail = emailSender(),
): OutboxHandler {
  return async (events) => {
    let failure: unknown = null;
    for (const event of events) {
      const id = (event.payload as { deletionId?: unknown } | null)?.deletionId;
      if (typeof id !== 'string') continue;
      const row = await prisma.accountDeletion.findUnique({ where: { id } });
      if (!row?.noticeEmail) continue;
      try {
        await send({
          to: row.noticeEmail,
          ...deletionNotice(row.via, row.requestedAt, row.purgeAfter),
          idempotencyKey: `deletion-${row.id}`,
        });
        await prisma.accountDeletion.update({
          where: { id },
          data: {
            noticeEmail: null,
            noticeSentAt: new Date(),
            noticeAttempts: { increment: 1 },
          },
        });
      } catch (error) {
        const attempts = row.noticeAttempts + 1;
        await prisma.accountDeletion.update({
          where: { id },
          data: {
            noticeAttempts: attempts,
            // Giving up also forgets the address.
            ...(attempts >= NOTICE_MAX_ATTEMPTS && { noticeEmail: null }),
          },
        });
        if (attempts < NOTICE_MAX_ATTEMPTS) failure ??= error;
      }
    }
    if (failure) throw failure;
  };
}
