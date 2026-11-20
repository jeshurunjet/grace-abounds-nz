import {
  lockPastorSet,
  lockUserSecurity,
  prisma,
  recordAudit,
  revokeSessions,
  Role,
  type Prisma,
} from '@grace-abounds/database';
import {
  auditCutoff,
  DELETION_RETENTION_DAYS,
  nzNow,
  type DeletionInfo,
} from '@grace-abounds/validation';
import { AppError, forbidden, notFound } from './errors.js';
import { lockAndRecheck, type Actor } from './identity.js';
import { endAccountExports } from './data-export.js';
import { discardProfilePhotos } from './profile-photo.js';
import { forgetNotifications } from './notifications.js';
import { emailSender, type SendEmail } from './email.js';
import type { OutboxHandler } from './outbox.js';
import {
  heldAudit,
  heldUserIds,
  lockRetentionGate,
  retentionPause,
  unheldAudit,
} from './retention-holds.js';
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
 *   history) is labelled "Deleted user" and purged after exactly 30 days,
 *   with the account row, even if a cancelled appointment was booked for a
 *   later date (owner policy, 21 November 2026; product policy, not a
 *   statutory deadline). A records hold (legal obligation, investigation,
 *   claim) keeps an account back until released. Church content is never touched: its author
 *   references are SET NULL; the audit log keeps content-free entries with
 *   the actor cleared.
 * - Fixed staff accounts (Pastor, Admin) can never be deleted here; staff
 *   may delete a member only when the member asked, with a note.
 * - The activity (audit) log follows calendar-year retention
 *   (auditCutoff); eligible entries are removed only on request ("Delete
 *   eligible records now"), never automatically.
 *
 * Lock order (same everywhere): retention gate (clean-ups and holds only),
 * Pastor set, then user security locks, then activity rows / export rows. Member writes (bookings, prayer and
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
      // The profile photo is a direct identifier: removed now.
      await discardProfilePhotos(tx, user.id, now);

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

      // Exactly 30 days (owner policy, 21 November 2026): this overrides
      // the not-before-its-time appointment rule for deleted accounts only;
      // ordinary care retention is unchanged. A records hold can still keep
      // the account back at purge time.
      const purgeAfter = new Date(
        now.getTime() + DELETION_RETENTION_DAYS * DAY,
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

type Tx = Prisma.TransactionClient;

/** Deleted accounts whose 30 days have passed. */
const dueAccounts = (now: Date) => ({
  stage: 'ACCESS_REMOVED' as const,
  purgeAfter: { lte: now },
});

/**
 * Inside a transaction that already holds the retention gate (shared):
 * purges the next due deleted account that no records hold covers, with
 * everything kept for it (bookings and history, prayers and appointments
 * with notes and history, exports, sessions, by cascade) and staff
 * notifications about those records. Church content and audit entries
 * stay (references set null). Returns null when none is due; `done` is
 * false when the account turned out not to be purgeable (skip it).
 */
export async function purgeNextDue(
  tx: Tx,
  now: Date,
  skip: string[] = [],
): Promise<{ id: string; done: boolean } | null> {
  const held = await heldUserIds(tx);
  const deletion = await tx.accountDeletion.findFirst({
    where: {
      ...dueAccounts(now),
      userId: { notIn: held },
      id: { notIn: skip },
    },
    orderBy: [{ purgeAfter: 'asc' }, { id: 'asc' }],
  });
  await retentionPause('purge.scanned');
  if (!deletion) return null;
  const no = { id: deletion.id, done: false };
  await lockUserSecurity(tx, deletion.userId);
  const current = await tx.accountDeletion.findUnique({
    where: { id: deletion.id },
  });
  if (!current || current.stage !== 'ACCESS_REMOVED') return no;
  // The gate already keeps hold changes out; checked again regardless.
  if ((await heldUserIds(tx, deletion.userId)).length) return no;
  const user = await tx.user.findUnique({
    where: { id: deletion.userId },
    select: { status: true, role: true },
  });
  if (user) {
    // Never anything but a deleted member account.
    if (user.status !== 'DELETION_PENDING' || user.role !== Role.MEMBER)
      return no;
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
  return { id: deletion.id, done: true };
}

/** Counts of due deleted accounts: still to purge, and kept by a hold. */
export async function countDueAccounts(db: Tx, now: Date, skip: string[] = []) {
  // One query at a time: this also runs inside transactions.
  const held = await heldUserIds(db);
  const due = await db.accountDeletion.count({
    where: {
      ...dueAccounts(now),
      userId: { notIn: held },
      id: { notIn: skip },
    },
  });
  const kept = await db.accountDeletion.count({
    where: { ...dueAccounts(now), userId: { in: held } },
  });
  return { due, held: kept };
}

/**
 * Purges up to `limit` due deleted accounts, one transaction each (gate,
 * then holds, then the person's lock). Retry-safe and idempotent.
 */
export async function purgeDeletedAccounts(now = new Date(), limit = 20) {
  if (!executionAllowed)
    return { skipped: true as const, purged: 0, held: 0, more: false };
  let purged = 0;
  const skip: string[] = [];
  while (purged + skip.length < limit) {
    const step = await prisma.$transaction(async (tx) => {
      await lockRetentionGate(tx, 'cleanup');
      return purgeNextDue(tx, now, skip);
    });
    if (!step) break;
    if (step.done) purged++;
    else skip.push(step.id);
  }
  const left = await prisma.$transaction(async (tx) => {
    await lockRetentionGate(tx, 'cleanup');
    return countDueAccounts(tx, now, skip);
  });
  return {
    skipped: false as const,
    purged,
    held: left.held,
    more: left.due > 0,
  };
}

/** Activity entries old enough to go at `now` (calendar-year rule). */
const oldAudit = (now: Date) => ({ createdAt: { lt: auditCutoff(now) } });
/** Purged deletion records of that age. */
const oldDeletions = (now: Date) => ({
  stage: 'PURGED' as const,
  purgedAt: { lt: auditCutoff(now) },
});

/**
 * Inside a transaction holding the retention gate: removes up to `limit`
 * eligible activity entries that no hold covers. Returns how many.
 */
export async function trimAuditBatch(tx: Tx, now: Date, limit: number) {
  const held = await heldUserIds(tx);
  const rows = await tx.auditEvent.findMany({
    where: { ...oldAudit(now), ...unheldAudit(held) },
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
  });
  await retentionPause('audit.scanned');
  if (!rows.length) return 0;
  const removed = await tx.auditEvent.deleteMany({
    where: {
      id: { in: rows.map((row) => row.id) },
      ...oldAudit(now),
      ...unheldAudit(held),
    },
  });
  return removed.count;
}

/** As trimAuditBatch, for purged deletion records of the same age. */
export async function trimDeletionBatch(tx: Tx, now: Date, limit: number) {
  const held = await heldUserIds(tx);
  const rows = await tx.accountDeletion.findMany({
    where: { ...oldDeletions(now), userId: { notIn: held } },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: limit,
  });
  if (!rows.length) return 0;
  const removed = await tx.accountDeletion.deleteMany({
    where: {
      id: { in: rows.map((row) => row.id) },
      ...oldDeletions(now),
      userId: { notIn: held },
    },
  });
  return removed.count;
}

/** What the trim would remove now, and what holds keep back. */
export async function countDueAudit(db: Tx, now: Date) {
  const held = await heldUserIds(db);
  const events = await db.auditEvent.count({
    where: { ...oldAudit(now), ...unheldAudit(held) },
  });
  const heldEvents = await db.auditEvent.count({
    where: { ...oldAudit(now), ...heldAudit(held) },
  });
  const deletions = await db.accountDeletion.count({
    where: { ...oldDeletions(now), userId: { notIn: held } },
  });
  return { events, heldEvents, deletions };
}

const TRIM_BATCH = 500;

/**
 * Removes activity (audit and security) records whose calendar-year
 * retention has ended (see auditCutoff), with purged deletion records of
 * the same age, except anything a records hold covers (entries a held
 * person made, or canonically about them). Works in bounded transactions,
 * each taking the retention gate before reading the holds. Disabled with
 * the rest of real execution; run only from "Delete eligible records now".
 */
export async function trimAuditLog(now = new Date()) {
  if (!executionAllowed)
    return { skipped: true as const, events: 0, deletions: 0, held: 0 };
  const batch = (step: typeof trimAuditBatch) =>
    prisma.$transaction(async (tx) => {
      await lockRetentionGate(tx, 'cleanup');
      return step(tx, now, TRIM_BATCH);
    });
  const drain = async (step: typeof trimAuditBatch) => {
    let total = 0;
    for (;;) {
      const count = await batch(step);
      total += count;
      if (count < TRIM_BATCH) return total;
    }
  };
  const events = await drain(trimAuditBatch);
  const deletions = await drain(trimDeletionBatch);
  const left = await prisma.$transaction(async (tx) => {
    await lockRetentionGate(tx, 'cleanup');
    return countDueAudit(tx, now);
  });
  return {
    skipped: false as const,
    events,
    deletions,
    held: left.heldEvents,
  };
}

/**
 * The mandatory notice: always sent, whatever the update preferences.
 * Access loss is immediate and said so; removal is not on an exact clock
 * (the 30-day date is when records become due, they are deleted by the
 * next due-only clean-up, and a records hold keeps what it covers), so the
 * notice never promises a removal date.
 */
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
    `Your remaining records are kept as “Deleted user” for 30 days. From ${format(purgeAfter)} they are due for removal and are deleted when the church next clears due records.`,
    'If the church must keep something for a legal obligation, investigation or claim, it is kept, with restricted access, only while that need is reviewed. Copies may remain in secure backups until they are replaced.',
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
