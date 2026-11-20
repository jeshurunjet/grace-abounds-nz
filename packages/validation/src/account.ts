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
