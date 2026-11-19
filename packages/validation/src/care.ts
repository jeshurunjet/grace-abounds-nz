import { z } from 'zod';

/*
 * Confidential care, part 1: prayer requests and in-app notifications
 * (Phase 4A). A prayer request is seen only by its member and the Pastor;
 * Admin sees no prayer requests, counts or notes. Statuses say what the
 * Pastor has done (never that a prayer was "answered"). Closed requests and
 * their notes are deleted 12 months after closing; open ones stay.
 */

export const prayerStatuses = ['submitted', 'praying', 'prayed_for'] as const;
export type PrayerStatus = (typeof prayerStatuses)[number];
export const prayerStatusLabels: Record<PrayerStatus, string> = {
  submitted: 'Submitted',
  praying: 'Praying',
  prayed_for: 'Prayed for',
};
/** What the Pastor can move a request to: forward only. */
export const nextPrayerStatuses: Record<PrayerStatus, PrayerStatus[]> = {
  submitted: ['praying', 'prayed_for'],
  praying: ['prayed_for'],
  prayed_for: [],
};

export const PRAYER_RETENTION_MONTHS = 12;
/** Shown before a member submits, in plain words. */
export const PRAYER_PRIVACY_NOTE =
  'Only you and the pastor can read this request; the admin team can’t. ' +
  'You’ll see when the pastor is praying and when they have prayed for it. ' +
  'Twelve months after it’s marked “Prayed for”, the request and the ' +
  'pastor’s private notes are deleted. Requests still open are kept.';

/** When a closed request is deleted. */
export function prayerDeleteAfter(closedAt: string) {
  const date = new Date(closedAt);
  date.setUTCMonth(date.getUTCMonth() + PRAYER_RETENTION_MONTHS);
  return date.toISOString();
}

export const prayerInputSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Write your prayer request.')
      .max(2000, 'Keep it under 2,000 characters.'),
    /** Made once per draft in the browser, so a retried submit adds one request. */
    clientKey: z.string().trim().min(8).max(64),
  })
  .strict();
export type PrayerInput = z.infer<typeof prayerInputSchema>;

export const prayerStatusInputSchema = z
  .object({ status: z.enum(['praying', 'prayed_for']) })
  .strict();

export const prayerNoteInputSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Write a note.')
      .max(2000, 'Keep it under 2,000 characters.'),
  })
  .strict();

export type PrayerHistoryEntry = { status: PrayerStatus; at: string };

/** A member's own request: no Pastor notes, ever. */
export type MemberPrayer = {
  id: string;
  text: string;
  status: PrayerStatus;
  createdAt: string;
  closedAt: string;
  /** When it will be deleted ('' while open). */
  deleteAfter: string;
  history: PrayerHistoryEntry[];
};

/** The Pastor's view of a request. */
export type PastorPrayer = MemberPrayer & {
  version: number;
  member: { name: string; email: string };
  noteCount: number;
};
export type PrayerNote = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
};
export type PastorPrayerDetail = PastorPrayer & { notes: PrayerNote[] };

/**
 * An in-app notification. Title and body are generic: never prayer text or
 * other confidential details. `href` is an app path the recipient can open;
 * the page it leads to checks access again.
 */
export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
};
export type NotificationList = { items: AppNotification[]; unread: number };

/** An internal app path: starts with one "/", no other site or scheme. */
export const isSafeAppPath = (href: string) =>
  /^\/(?![/\\])[\w\-./?=&#%]*$/.test(href);
