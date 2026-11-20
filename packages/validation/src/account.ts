import { z } from 'zod';
import { addDays, isRealDate, nzLocalToUtc, nzNow } from './activities.ts';

/*
 * Account settings, delivery controls and personal data export (Phase 5).
 *
 * Notification preferences control optional update emails only. In-app
 * notifications are always kept (they are the record in the bell), and
 * security emails (sign-in and verification codes, password reset,
 * "confirm it's you") are always sent, whatever is chosen here.
 */

export const notificationPreferencesSchema = z
  .object({
    emailCare: z.boolean(),
    emailAccount: z.boolean(),
  })
  .strict();
export type NotificationPreferencesInput = z.infer<
  typeof notificationPreferencesSchema
>;
export type NotificationPreferences = NotificationPreferencesInput & {
  version: number;
};
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesInput = {
  emailCare: false,
  emailAccount: false,
};

/** Which optional email category a notification kind belongs to. */
export type EmailCategory = 'care' | 'account';
export function emailCategoryFor(kind: string): EmailCategory | null {
  if (kind.startsWith('prayer') || kind.startsWith('appointment'))
    return 'care';
  if (kind.startsWith('export')) return 'account';
  return null;
}

// ---------- Personal data export (5B) ----------

/** How long a ready export can be downloaded before it is removed. */
export const EXPORT_TTL_DAYS = 7;
/** How long one download link works once issued. */
export const EXPORT_LINK_SECONDS = 300;
/** At most this many export requests per rolling 24 hours. */
export const EXPORT_DAILY_LIMIT = 3;
/** Failed or expired request records are removed after this many days. */
export const EXPORT_RECORD_DAYS = 30;

export const dataExportStatuses = [
  'queued',
  'building',
  'ready',
  'failed',
  'expired',
] as const;
export type DataExportStatus = (typeof dataExportStatuses)[number];

export type DataExportItem = {
  id: string;
  status: DataExportStatus;
  createdAt: string;
  readyAt: string;
  expiresAt: string;
  size: number;
};

export type DataExportDownload = { url: string; expiresAt: string };

export const EXPORT_CONTENTS_NOTE =
  'Your export includes your profile and account details, sign-in methods (never passwords or keys), signed-in devices, notification settings, your bookings and their history, your prayer requests and appointments with their history, and your notifications. It never includes other people’s details, the pastor’s private notes or anything staff-only.';

// ---------- Account deletion (5C) ----------

/** What remains of a deleted account ("Deleted user") is purged after this. */
export const DELETION_RETENTION_DAYS = 30;
/*
 * Activity (audit and security) log retention, by calendar year in New
 * Zealand time (owner policy, 21 November 2026; proposed exact formula):
 * an entry is kept for the whole calendar year it was recorded in and the
 * whole calendar year after, and becomes eligible for deletion at 00:00
 * NZ time on 1 January of the year after that. So an entry from the
 * last minute of 31 December (23:59) is kept one year and one minute; one
 * made at 00:00 on 1 January exactly two calendar years (the maximum). The
 * formula is proposed and still awaits the owner's explicit approval.
 * Eligible entries are only removed when staff choose "Delete eligible
 * records now" (never automatically), and never while a records hold
 * covers the person they are about.
 */
export const AUDIT_RETENTION_RULE =
  'Activity records are kept for the calendar year they were made in and all of the next calendar year (New Zealand time). The shortest keep is one year and one minute (a record made at 23:59 on 31 December); the longest is two years (one made at 00:00 on 1 January).';

/** The New Zealand calendar year of an instant. */
export const nzYear = (at: Date) => Number(nzNow(at).date.slice(0, 4));
/** When an entry made at `createdAt` becomes eligible for deletion. */
export const auditEligibleFrom = (createdAt: Date) =>
  nzLocalToUtc(`${nzYear(createdAt) + 2}-01-01`, '00:00');
/** Entries made before this instant are eligible for deletion at `now`. */
export const auditCutoff = (now: Date) =>
  nzLocalToUtc(`${nzYear(now) - 1}-01-01`, '00:00');
export const DELETED_USER_LABEL = 'Deleted user';

/** The member deleting their own account (with a recent sign-in). */
export const accountDeletionSchema = z
  .object({
    confirm: z.literal('DELETE', { message: 'Type DELETE to confirm.' }),
  })
  .strict();

/** Staff deleting a member's account, only at the member's request. */
export const staffDeletionSchema = z
  .object({
    confirm: z.literal('DELETE', { message: 'Type DELETE to confirm.' }),
    memberRequested: z.literal(true, {
      message: 'Only delete an account when the member has asked.',
    }),
    requestNote: z
      .string()
      .trim()
      .min(3, 'Say how the member asked (for example, “phoned the office”).')
      .max(200),
  })
  .strict();

export type DeletionInfo = {
  via: 'self' | 'staff';
  requestedAt: string;
  /** When the remaining "Deleted user" records become due: 30 days on. */
  purgeAfter: string;
  purgedAt: string;
};

export const DELETION_EFFECTS_NOTE =
  'Deleting your account can’t be undone. You’ll be signed out everywhere straight away and can’t sign in again. Your upcoming bookings are cancelled, open appointments are closed, and any data export is removed. Your prayer requests, appointment history and booking history are kept as “Deleted user” for 30 days. After that they become due for removal and are deleted when the church next clears due records. If the church must keep something for a legal obligation, investigation or claim, it is kept, with restricted access, only while that need is reviewed. Church content such as sermons and website pages stays. Copies may remain in secure backups until they are replaced.';

/**
 * When a record kept for a deleted account is actually removed: its own
 * retention date, or the account purge if that comes first.
 */
export function effectiveDeleteAfter(own: string, purgeAfter = '') {
  if (!purgeAfter) return own;
  if (!own) return purgeAfter;
  return Date.parse(own) <= Date.parse(purgeAfter) ? own : purgeAfter;
}

// ---------- Profile photo ----------

/**
 * Largest upload (bytes). The cropped PNG must fit through the 1 MB
 * request limit as base64, so the crop is PROFILE_PHOTO_SIDE wide.
 */
export const PROFILE_PHOTO_MAX_BYTES = 700 * 1024;
export const PROFILE_PHOTO_MIN_SIDE = 64;
export const PROFILE_PHOTO_MAX_SIDE = 1024;
/** The picker's output: a square PNG this many pixels wide. */
export const PROFILE_PHOTO_SIDE = 384;

/**
 * A profile photo upload: the cropped image as a PNG data URL. The server
 * decodes and checks the bytes themselves, not this label.
 */
export const profilePhotoInputSchema = z
  .object({
    image: z
      .string()
      .max(Math.ceil((PROFILE_PHOTO_MAX_BYTES * 4) / 3) + 32)
      .regex(
        /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/,
        'Choose a photo again: it must be sent as a PNG.',
      ),
  })
  .strict();

// ---------- Records holds and due-only clean-up (5C) ----------

export const retentionHoldReasons = [
  'legal_obligation',
  'investigation',
  'claim',
] as const;
export type RetentionHoldReason = (typeof retentionHoldReasons)[number];
export const retentionHoldReasonLabels: Record<RetentionHoldReason, string> = {
  legal_obligation: 'Legal obligation',
  investigation: 'Investigation',
  claim: 'Claim or dispute',
};
/** A hold's review date is at most this far ahead (no open-ended holds). */
export const HOLD_MAX_REVIEW_DAYS = 365;

const reviewDate = z
  .string()
  .trim()
  .refine(isRealDate, { message: 'Choose a review date.' });

export const retentionHoldInputSchema = z
  .object({
    userId: z.string().trim().min(1).max(64),
    reason: z.enum(retentionHoldReasons),
    reference: z
      .string()
      .trim()
      .min(3, 'Give a short reference, such as a case number.')
      .max(120),
    basis: z
      .string()
      .trim()
      .min(3, 'Say briefly why the records must be kept.')
      .max(300),
    reviewBy: reviewDate,
  })
  .strict();
export const retentionHoldRenewSchema = z
  .object({ reviewBy: reviewDate })
  .strict();

/**
 * "Delete eligible records now": the page makes one key per press and
 * sends the same key on every retry, so a retry resumes (or reports) that
 * same run instead of starting another.
 */
export const retentionRunInputSchema = z
  .object({
    requestKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,100}$/, 'Use a valid request key.'),
  })
  .strict();

/** True if a review date (YYYY-MM-DD) is after today and within a year. */
export function reviewDateAllowed(reviewBy: string, now = new Date()) {
  const today = nzNow(now).date;
  return reviewBy > today && reviewBy <= addDays(today, HOLD_MAX_REVIEW_DAYS);
}

export type RetentionHoldItem = {
  id: string;
  userId: string;
  /** The person's name, or "Deleted user". */
  subject: string;
  reason: RetentionHoldReason;
  reference: string;
  basis: string;
  reviewBy: string;
  /** The review date has passed: the hold still protects until released. */
  overdue: boolean;
  placedAt: string;
  version: number;
};

export type RetentionPreview = {
  /** Whether "Delete eligible records now" can run on this server. */
  enabled: boolean;
  auditRule: string;
  /** Activity records made before this are eligible. */
  auditCutoff: string;
  due: {
    deletedAccounts: number;
    auditEvents: number;
    deletionRecords: number;
  };
  /** Due but kept back by a records hold. */
  held: { deletedAccounts: number; auditEvents: number };
  holds: { active: number; overdue: number };
  lastRun: RetentionRunSummary | null;
};

export type RetentionRunSummary = {
  id: string;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt: string;
  /** How many times this run was started or resumed. */
  attempts: number;
  removed: {
    deletedAccounts: number;
    auditEvents: number;
    deletionRecords: number;
  };
  held: { deletedAccounts: number; auditEvents: number };
  /** Some due records were left for the next run (batch limit). */
  more: boolean;
};
