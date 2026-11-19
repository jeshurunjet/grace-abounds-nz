import { z } from 'zod';
import {
  DAYLIGHT_SAVING_MESSAGE,
  inDaylightSavingHour,
  isRealDate,
} from './activities.ts';

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

// ---------- Private appointments (Phase 4B) ----------
/*
 * A member asks for an appointment; staff suggest a time (a proposal does
 * not reserve anything); the member accepts, or staff confirm a time agreed
 * another way, and only then is the slot reserved. Members see their own;
 * the Pastor sees everything including the reason and private notes; Admin
 * helps with scheduling and sees only who (name and contact), when, where
 * and the status, never the topic, message or notes. Appointments never
 * appear on the public calendar or Google. Thirty days after one is
 * completed, cancelled or declined (and once its time has passed) it is
 * deleted with its notes, history and notifications.
 */

export const appointmentStatuses = [
  'requested',
  'proposed',
  'confirmed',
  'completed',
  'cancelled',
  'declined',
] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];
export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  requested: 'Requested',
  proposed: 'Time suggested',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Declined',
};
export const terminalAppointmentStatuses: AppointmentStatus[] = [
  'completed',
  'cancelled',
  'declined',
];
export const appointmentTopics = [
  'Pastoral care',
  'Prayer',
  'Baptism',
  'Marriage and family',
  'Something else',
] as const;
export const preferredTimes = [
  'any',
  'morning',
  'afternoon',
  'evening',
] as const;
export type PreferredTime = (typeof preferredTimes)[number];
export const preferredTimeLabels: Record<PreferredTime, string> = {
  any: 'Any time',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export const APPOINTMENT_RETENTION_DAYS = 30;
/** Shown before a member asks, in plain words. */
export const APPOINTMENT_PRIVACY_NOTE =
  'The pastor sees your topic and message. The admin team helps with ' +
  'scheduling and sees only your name, contact details and the ' +
  'appointment’s time, place and status, never your topic or message. ' +
  'Appointments never appear on the public church calendar. Thirty days ' +
  'after an appointment is completed, cancelled or declined, it is deleted ' +
  'with its notes and history.';

/** When a closed appointment is deleted (also not before its time). */
export function appointmentDeleteAfter(closedAt: string, startsAt = '') {
  const after = Date.parse(closedAt) + APPOINTMENT_RETENTION_DAYS * 86_400_000;
  const time = startsAt ? Date.parse(startsAt) : 0;
  return new Date(Math.max(after, time)).toISOString();
}

const appointmentDate = z
  .string()
  .trim()
  .refine((value) => value === '' || isRealDate(value), {
    message: 'Choose a real date.',
  });

export const appointmentInputSchema = z
  .object({
    topic: z.enum(appointmentTopics, { message: 'Choose a topic.' }),
    reason: z.string().trim().max(2000, 'Keep it under 2,000 characters.'),
    preferredDate: appointmentDate,
    preferredTime: z.enum(preferredTimes),
    /** Made once per draft in the browser, so a retried request adds one. */
    clientKey: z.string().trim().min(8).max(64),
  })
  .strict();
export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

/** A time suggested or confirmed by staff, in New Zealand local time. */
export const appointmentSlotSchema = z
  .object({
    date: z.string().trim().refine(isRealDate, { message: 'Choose a date.' }),
    time: z
      .string()
      .trim()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Choose a time.')
      .refine((value) => !inDaylightSavingHour(value), {
        message: DAYLIGHT_SAVING_MESSAGE,
      }),
    minutes: z
      .number()
      .int()
      .min(15, 'At least 15 minutes.')
      .max(240, 'At most 4 hours.'),
    location: z.string().trim().max(160, 'Keep it under 160 characters.'),
  })
  .strict();
export type AppointmentSlot = z.infer<typeof appointmentSlotSchema>;
/** Staff confirming: the suggested time, or a time agreed another way. */
export const appointmentConfirmSchema = z
  .object({ slot: appointmentSlotSchema.optional() })
  .strict();

export const appointmentNoteInputSchema = prayerNoteInputSchema;

export type AppointmentHistoryEntry = {
  status: AppointmentStatus;
  at: string;
  /** The time it referred to, if any (suggested or confirmed). */
  startsAt: string;
  endsAt: string;
};

/** What staff and the member all see: scheduling, never the reason. */
type AppointmentLogistics = {
  id: string;
  status: AppointmentStatus;
  preferredDate: string;
  preferredTime: PreferredTime;
  startsAt: string;
  endsAt: string;
  location: string;
  createdAt: string;
  closedAt: string;
  deleteAfter: string;
  history: AppointmentHistoryEntry[];
};

/** A member's own appointment: no staff notes, ever. */
export type MemberAppointment = AppointmentLogistics & {
  /** For the member's own actions (accept, another time, cancel). */
  version: number;
  topic: string;
  reason: string;
};

/**
 * Staff view. Admin receives no topic, reason or notes at all (the fields
 * are absent, not blank); the Pastor receives them.
 */
export type StaffAppointment = AppointmentLogistics & {
  version: number;
  member: { name: string; email: string; phone: string };
  topic?: string;
  reason?: string;
  noteCount?: number;
};
export type StaffAppointmentDetail = StaffAppointment & {
  notes?: PrayerNote[];
};
