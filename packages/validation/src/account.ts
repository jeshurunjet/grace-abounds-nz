import { z } from 'zod';

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
/** Activity (audit) log entries are kept this long (rolling). */
export const AUDIT_RETENTION_DAYS = 365;
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
  /**
   * When the remaining "Deleted user" records are removed: 30 days after
   * the request, or later if an appointment can't be removed before then.
   */
  purgeAfter: string;
  purgedAt: string;
};

export const DELETION_EFFECTS_NOTE =
  'Deleting your account can’t be undone. You’ll be signed out everywhere straight away and can’t sign in again. Your upcoming bookings are cancelled, open appointments are closed, and any data export is removed. Your prayer requests, appointment history and booking history are kept as “Deleted user” for 30 days (longer if an appointment was booked for a later date), then removed for good. Church content such as sermons and website pages stays. Copies may remain in secure backups until they are replaced.';

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
