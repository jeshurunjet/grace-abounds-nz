/**
 * Activities: one model for services, connect groups, Bible studies, events
 * and ministry teams, plus the calendar engine that turns their schedules
 * into dated occurrences. Shared by the API (validation, public bundle) and
 * the website (calendars, detail pages, editor) so both use one tested
 * recurrence implementation (Phase 3A).
 *
 * All dates and times are New Zealand wall-clock values (Pacific/Auckland):
 * dates are 'YYYY-MM-DD', times 'HH:mm'. Storing local times (not UTC
 * instants) keeps a 10:00am service at 10:00am across daylight saving.
 */
import { z } from 'zod';
import { IMAGE_REF_MESSAGE, isImageRef } from './content.ts';
export const CHURCH_TIME_ZONE = 'Pacific/Auckland';

export type ActivityKind = 'service' | 'group' | 'study' | 'event' | 'ministry';
export type ActivityStatus = 'draft' | 'scheduled' | 'published' | 'archived';
export type Repeat = 'once' | 'weekly' | 'fortnightly' | 'monthly' | 'ongoing';
/** membership = join once, ongoing · booking = book a specific date */
export type JoinMode = 'membership' | 'booking' | 'none';

export type ActivitySchedule = {
  repeat: Repeat;
  /** once: the date. Repeating: first date the pattern applies. */
  date: string;
  /** Optional last date for a repeating pattern ('' = no end). */
  until: string;
  /** weekly / fortnightly: weekdays, 0 = Sunday. */
  days: number[];
  /** monthly: 1–4, or -1 for the last week of the month. */
  monthWeek: number;
  /** monthly: weekday, 0 = Sunday. */
  monthDay: number;
  startTime: string;
  endTime: string;
};

export type Activity = {
  id: string;
  slug: string;
  kind: ActivityKind;
  title: string;
  summary: string;
  leader: string;
  tag: string;
  /** Campus id from Website content → Locations, or '' for off-site. */
  locationId: string;
  /** Room or off-site place, e.g. "Main Auditorium", "Various cafés". */
  venue: string;
  image: string;
  schedule: ActivitySchedule;
  joinMode: JoinMode;
  /** Members per activity (membership) or per date (booking); null = no limit. */
  capacity: number | null;
  status: ActivityStatus;
  /** When a scheduled activity goes live, 'YYYY-MM-DDTHH:mm' NZ time. */
  publishAt: string;
  /** Id of the matching Google / Microsoft calendar event once synced. */
  externalId?: string;
};

export type ActivityException = {
  id: string;
  activityId: string;
  date: string;
  kind: 'cancelled' | 'changed';
  note: string;
  /** For 'changed': replacement values ('' keeps the original). */
  startTime: string;
  endTime: string;
  venue: string;
};

/** A member joined to an activity (date '') or booked onto one date. */
export type Participation = {
  id: string;
  activityId: string;
  userId: string;
  date: string;
  createdAt: string;
};

export type Occurrence = {
  key: string;
  activity: Activity;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  cancelled: boolean;
  changed: boolean;
  note: string;
};

export const kindLabels: Record<ActivityKind, string> = {
  service: 'Service',
  group: 'Connect group',
  study: 'Bible study',
  event: 'Event',
  ministry: 'Ministry team',
};
export const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const ordinals: Record<number, string> = {
  1: 'First',
  2: 'Second',
  3: 'Third',
  4: 'Fourth',
  [-1]: 'Last',
};

// ---------- Time helpers (all NZ wall-clock) ----------
const DAY = 86_400_000;
const toUtc = (date: string) =>
  Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
const fromUtc = (time: number) => new Date(time).toISOString().slice(0, 10);
export const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
export const addDays = (date: string, days: number) =>
  fromUtc(toUtc(date) + days * DAY);
export const weekdayOf = (date: string) => new Date(toUtc(date)).getUTCDay();

/** Current NZ date/time regardless of the viewer's device time zone. */
export function nzNow(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: CHURCH_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  return { date, time, stamp: `${date}T${time}` };
}

export function formatTime(time: string) {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${suffix}`;
}
export function formatDate(date: string, withYear = false) {
  if (!isIsoDate(date)) return date;
  return new Date(toUtc(date)).toLocaleDateString('en-NZ', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear && { year: 'numeric' }),
  });
}

// ---------- Visibility ----------
/** Published, or scheduled with a release time that has passed. */
export function isLive(activity: Activity, now = nzNow().stamp) {
  return (
    activity.status === 'published' ||
    (activity.status === 'scheduled' &&
      !!activity.publishAt &&
      activity.publishAt <= now)
  );
}

// ---------- Calendar engine ----------
function matches(schedule: ActivitySchedule, date: string) {
  const weekday = weekdayOf(date);
  switch (schedule.repeat) {
    case 'once':
      return date === schedule.date;
    case 'weekly':
      return schedule.days.includes(weekday);
    case 'fortnightly': {
      if (!schedule.days.includes(weekday)) return false;
      const anchor = toUtc(schedule.date) - weekdayOf(schedule.date) * DAY;
      return Math.floor((toUtc(date) - anchor) / (7 * DAY)) % 2 === 0;
    }
    case 'monthly': {
      if (weekday !== schedule.monthDay) return false;
      const dayOfMonth = +date.slice(8, 10);
      if (schedule.monthWeek === -1)
        return addDays(date, 7).slice(5, 7) !== date.slice(5, 7);
      return Math.ceil(dayOfMonth / 7) === schedule.monthWeek;
    }
    default:
      return false;
  }
}

/** Dates in [from, to] on which the schedule falls. */
export function scheduleDates(
  schedule: ActivitySchedule,
  from: string,
  to: string,
): string[] {
  if (schedule.repeat === 'ongoing' || !isIsoDate(schedule.date)) return [];
  if (schedule.repeat === 'once')
    return schedule.date >= from && schedule.date <= to ? [schedule.date] : [];
  const start = schedule.date > from ? schedule.date : from;
  const end = schedule.until && schedule.until < to ? schedule.until : to;
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1))
    if (matches(schedule, date)) dates.push(date);
  return dates;
}

/** Every occurrence of the given activities between two dates, in order. */
export function occurrences(
  activities: Activity[],
  exceptions: ActivityException[],
  from: string,
  to: string,
): Occurrence[] {
  return activities
    .flatMap((activity) =>
      scheduleDates(activity.schedule, from, to).map((date) => {
        const exception = exceptions.find(
          (item) => item.activityId === activity.id && item.date === date,
        );
        const changed = exception?.kind === 'changed';
        return {
          key: `${activity.id}:${date}`,
          activity,
          date,
          startTime:
            (changed && exception.startTime) || activity.schedule.startTime,
          endTime: (changed && exception.endTime) || activity.schedule.endTime,
          venue: (changed && exception.venue) || activity.venue,
          cancelled: exception?.kind === 'cancelled',
          changed,
          note: exception?.note ?? '',
        };
      }),
    )
    .sort((a, b) =>
      `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
    );
}

/** Upcoming occurrences of one activity, starting today (NZ). */
export function upcoming(
  activity: Activity,
  exceptions: ActivityException[],
  count = 6,
  today = nzNow().date,
) {
  return occurrences([activity], exceptions, today, addDays(today, 400)).slice(
    0,
    count,
  );
}

/** Plain-English schedule, e.g. "Every Sunday · 10:00am". */
export function describeSchedule(schedule: ActivitySchedule) {
  const time = schedule.startTime
    ? ` · ${formatTime(schedule.startTime)}${schedule.endTime ? `–${formatTime(schedule.endTime)}` : ''}`
    : '';
  const days = schedule.days
    .slice()
    .sort()
    .map((day) => weekdays[day])
    .join(' & ');
  switch (schedule.repeat) {
    case 'once':
      return `${formatDate(schedule.date, true)}${time}`;
    case 'weekly':
      return `Every ${days || 'week'}${time}`;
    case 'fortnightly':
      return `Every second ${days || 'week'}${time}`;
    case 'monthly':
      return `${ordinals[schedule.monthWeek] ?? 'First'} ${weekdays[schedule.monthDay]} of the month${time}`;
    default:
      return 'Ongoing · times arranged with the team';
  }
}

/** The coming Sunday (today if it is Sunday), NZ date. */
export function nextSunday(today = nzNow().date) {
  return addDays(today, (7 - weekdayOf(today)) % 7);
}

// ---------- Participation ----------
export function participants(
  activity: Activity,
  participations: Participation[],
  date = '',
) {
  return participations.filter(
    (item) =>
      item.activityId === activity.id &&
      (activity.joinMode === 'booking' ? item.date === date : !item.date),
  );
}
export function spotsLeft(
  activity: Activity,
  participations: Participation[],
  date = '',
) {
  if (activity.capacity == null) return null;
  return Math.max(
    0,
    activity.capacity - participants(activity, participations, date).length,
  );
}

// ---------- Calendar export (iCalendar / Google / Microsoft) ----------
const icsDays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
/** RFC 5545 RRULE, as used by .ics files and the Google Calendar API. */
export function toRRule(schedule: ActivitySchedule): string | null {
  const until = schedule.until
    ? `;UNTIL=${schedule.until.replace(/-/g, '')}T105959Z`
    : '';
  const byDay = schedule.days.map((day) => icsDays[day]).join(',');
  switch (schedule.repeat) {
    case 'weekly':
      return `FREQ=WEEKLY;BYDAY=${byDay}${until}`;
    case 'fortnightly':
      return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${byDay}${until}`;
    case 'monthly':
      return `FREQ=MONTHLY;BYDAY=${schedule.monthWeek}${icsDays[schedule.monthDay]}${until}`;
    default:
      return null;
  }
}
/** Microsoft Graph patternedRecurrence for the Outlook / Office 365 API. */
export function toGraphRecurrence(schedule: ActivitySchedule) {
  const names = weekdays.map((day) => day.toLowerCase());
  const index = {
    1: 'first',
    2: 'second',
    3: 'third',
    4: 'fourth',
    [-1]: 'last',
  };
  if (!['weekly', 'fortnightly', 'monthly'].includes(schedule.repeat))
    return null;
  return {
    pattern:
      schedule.repeat === 'monthly'
        ? {
            type: 'relativeMonthly',
            interval: 1,
            daysOfWeek: [names[schedule.monthDay]],
            index: index[schedule.monthWeek as 1] ?? 'first',
          }
        : {
            type: 'weekly',
            interval: schedule.repeat === 'fortnightly' ? 2 : 1,
            daysOfWeek: schedule.days.map((day) => names[day]),
            firstDayOfWeek: 'sunday',
          },
    range: schedule.until
      ? { type: 'endDate', startDate: schedule.date, endDate: schedule.until }
      : { type: 'noEnd', startDate: schedule.date },
  };
}

const NZ_TIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Pacific/Auckland',
  'BEGIN:STANDARD',
  'DTSTART:19700405T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU',
  'TZOFFSETFROM:+1300',
  'TZOFFSETTO:+1200',
  'TZNAME:NZST',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700927T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=9;BYDAY=-1SU',
  'TZOFFSETFROM:+1200',
  'TZOFFSETTO:+1300',
  'TZNAME:NZDT',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
];
const icsText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, '\\$&');
const icsStamp = (date: string, time: string) =>
  `${date.replace(/-/g, '')}T${(time || '00:00').replace(':', '')}00`;

/**
 * An .ics file for one date (when `date` is given) or the whole repeating
 * series, with cancelled dates excluded. Opens in Google, Apple and Outlook.
 */
export function toIcs(
  activity: Activity,
  options: {
    exceptions: ActivityException[];
    location: string;
    date?: string;
    url?: string;
  },
) {
  const { schedule } = activity;
  const single = options.date ?? schedule.date;
  const occurrence = options.date
    ? occurrences([activity], options.exceptions, single, single)[0]
    : undefined;
  const start = occurrence?.startTime ?? schedule.startTime;
  const end = occurrence?.endTime || schedule.endTime || start;
  const rule = options.date ? null : toRRule(schedule);
  const cancelled = options.exceptions
    .filter(
      (item) => item.activityId === activity.id && item.kind === 'cancelled',
    )
    .map(
      (item) =>
        `EXDATE;TZID=${CHURCH_TIME_ZONE}:${icsStamp(item.date, schedule.startTime)}`,
    );
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grace Abounds NZ//Activities//EN',
    'CALSCALE:GREGORIAN',
    ...NZ_TIMEZONE,
    'BEGIN:VEVENT',
    `UID:${activity.id}${options.date ? `-${options.date}` : ''}@graceaboundsnz.org`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=${CHURCH_TIME_ZONE}:${icsStamp(single, start)}`,
    `DTEND;TZID=${CHURCH_TIME_ZONE}:${icsStamp(single, end)}`,
    ...(rule ? [`RRULE:${rule}`, ...cancelled] : []),
    `SUMMARY:${icsText(activity.title)}`,
    `DESCRIPTION:${icsText(activity.summary)}`,
    `LOCATION:${icsText(options.location)}`,
    ...(options.url ? [`URL:${options.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

// ---------- New records ----------
export function blankSchedule(repeat: Repeat = 'once'): ActivitySchedule {
  return {
    repeat,
    date: nzNow().date,
    until: '',
    days: [0],
    monthWeek: 1,
    monthDay: 6,
    startTime: '10:00',
    endTime: '11:30',
  };
}
export function blankActivity(kind: ActivityKind): Activity {
  const id = crypto.randomUUID();
  return {
    id,
    slug: `${kind}-${id.slice(0, 8)}`,
    kind,
    title: `New ${kindLabels[kind].toLowerCase()}`,
    summary: '',
    leader: '',
    tag: kindLabels[kind],
    locationId: '',
    venue: '',
    image: '/images/community.jpg',
    schedule: blankSchedule(
      kind === 'event' ? 'once' : kind === 'ministry' ? 'ongoing' : 'weekly',
    ),
    joinMode: kind === 'service' || kind === 'event' ? 'booking' : 'membership',
    capacity: null,
    status: 'draft',
    publishAt: '',
  };
}

// ---------- Saved records (Phase 3A) ----------
export const activityKinds = [
  'service',
  'group',
  'study',
  'event',
  'ministry',
] as const;
export const repeats = [
  'once',
  'weekly',
  'fortnightly',
  'monthly',
  'ongoing',
] as const;
export const joinModes = ['booking', 'membership', 'none'] as const;
/** Saved status; "scheduled" is a published record with a future publishAt. */
export const activityStatuses = ['draft', 'published', 'archived'] as const;
export type ActivityRecordStatus = (typeof activityStatuses)[number];

/** A date that exists on the calendar (not 2026-02-30). */
export const isRealDate = (value: string) =>
  isIsoDate(value) && fromUtc(toUtc(value)) === value;
const isTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
/**
 * New Zealand clocks skip 2:00–3:00am on the last Sunday of September and
 * repeat it on the first Sunday of April. A time in that hour may not exist
 * or may happen twice, so activities never start or end in it.
 */
export const inDaylightSavingHour = (time: string) =>
  time >= '02:00' && time < '03:00';
export const DAYLIGHT_SAVING_MESSAGE =
  'Times from 2:00 to 3:00am can fall in a daylight saving change. Choose another time.';

/** The UTC instant of a New Zealand local date and time. */
export function nzLocalToUtc(date: string, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const target = toUtc(date) + (hours * 60 + minutes) * 60_000;
  let guess = target - 12 * 3_600_000;
  for (let step = 0; step < 3; step++) {
    const local = nzNow(new Date(guess));
    const [h = 0, m = 0] = local.time.split(':').map(Number);
    guess += target - (toUtc(local.date) + (h * 60 + m) * 60_000);
  }
  return new Date(guess);
}

const text = (max: number) => z.string().trim().max(max);
const scheduleSchema = z
  .object({
    repeat: z.enum(repeats),
    date: z.string().trim(),
    until: z.string().trim(),
    days: z.array(z.number().int().min(0).max(6)).max(7),
    monthWeek: z.number().int().min(-1).max(4),
    monthDay: z.number().int().min(0).max(6),
    startTime: z.string().trim(),
    endTime: z.string().trim(),
  })
  .strict()
  .superRefine((schedule, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    const dated = schedule.repeat !== 'ongoing';
    if (!isRealDate(schedule.date))
      issue(
        'date',
        schedule.repeat === 'once' ? 'Choose a date.' : 'Choose a start date.',
      );
    if (schedule.until && !isRealDate(schedule.until))
      issue('until', 'Choose a real end date, or leave it blank.');
    else if (schedule.until && schedule.until < schedule.date)
      issue('until', 'The last date must be on or after the first date.');
    if (dated && !isTime(schedule.startTime))
      issue('startTime', 'Choose a start time.');
    if (!dated && schedule.startTime && !isTime(schedule.startTime))
      issue('startTime', 'Choose a start time, or leave it blank.');
    if (schedule.endTime && !isTime(schedule.endTime))
      issue('endTime', 'Choose an end time, or leave it blank.');
    else if (
      schedule.endTime &&
      isTime(schedule.startTime) &&
      schedule.endTime <= schedule.startTime
    )
      issue('endTime', 'The end time must be after the start time.');
    for (const key of ['startTime', 'endTime'] as const)
      if (isTime(schedule[key]) && inDaylightSavingHour(schedule[key]))
        issue(key, DAYLIGHT_SAVING_MESSAGE);
    if (
      (schedule.repeat === 'weekly' || schedule.repeat === 'fortnightly') &&
      !schedule.days.length
    )
      issue('days', 'Choose at least one day of the week.');
    if (new Set(schedule.days).size !== schedule.days.length)
      issue('days', 'Choose each day once.');
    if (schedule.repeat === 'monthly' && schedule.monthWeek === 0)
      issue('monthWeek', 'Choose which week of the month.');
  });

export const activityInputSchema = z
  .object({
    kind: z.enum(activityKinds),
    title: z.string().trim().min(1, 'Enter a title.').max(120),
    summary: text(1000),
    leader: text(120),
    tag: text(40),
    /** A campus key (Locations), or '' for off-site / several places. */
    locationId: text(40),
    venue: text(120),
    image: text(500).refine(
      (value) => value === '' || isImageRef(value),
      IMAGE_REF_MESSAGE,
    ),
    schedule: scheduleSchema,
    joinMode: z.enum(joinModes),
    capacity: z.number().int().min(1).max(100_000).nullable(),
    status: z.enum(activityStatuses),
    /** NZ local 'YYYY-MM-DDTHH:mm' release time of a published record, or ''. */
    publishAt: z.string().trim(),
  })
  .strict()
  .superRefine((activity, context) => {
    if (activity.joinMode === 'none' && activity.capacity !== null)
      context.addIssue({
        code: 'custom',
        path: ['capacity'],
        message: 'Places apply only when people can join or book.',
      });
    if (activity.publishAt) {
      const [date = '', time = ''] = activity.publishAt.split('T');
      if (!isRealDate(date) || !isTime(time))
        context.addIssue({
          code: 'custom',
          path: ['publishAt'],
          message: 'Choose a real release date and time, or leave it blank.',
        });
      else if (activity.status !== 'published')
        context.addIssue({
          code: 'custom',
          path: ['publishAt'],
          message: 'Only a published activity has a release time.',
        });
    }
  });
export type ActivityInput = z.infer<typeof activityInputSchema>;

/** Change or cancel one original date of an activity. */
export const activityExceptionInputSchema = z
  .object({
    kind: z.enum(['cancelled', 'changed']),
    note: text(300),
    startTime: z.string().trim(),
    endTime: z.string().trim(),
    venue: text(120),
  })
  .strict()
  .superRefine((exception, context) => {
    for (const key of ['startTime', 'endTime'] as const) {
      const value = exception[key];
      if (value && !isTime(value))
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Choose a time, or leave it blank to keep the usual one.',
        });
      else if (value && inDaylightSavingHour(value))
        context.addIssue({
          code: 'custom',
          path: [key],
          message: DAYLIGHT_SAVING_MESSAGE,
        });
    }
    if (
      exception.kind === 'changed' &&
      !exception.startTime &&
      !exception.endTime &&
      !exception.venue &&
      !exception.note
    )
      context.addIssue({
        code: 'custom',
        path: ['startTime'],
        message: 'Change the time, place or note for this date.',
      });
  });
export type ActivityExceptionInput = z.infer<
  typeof activityExceptionInputSchema
>;

/** An activity as staff see it: every status, with its version. */
export type StaffActivity = Activity & { version: number; updatedAt: string };
export type StaffActivities = {
  activities: StaffActivity[];
  exceptions: ActivityException[];
};

/** The activity fields an editor holds (everything but identity). */
export const activityInput = (activity: Activity): ActivityInput => ({
  kind: activity.kind,
  title: activity.title,
  summary: activity.summary,
  leader: activity.leader,
  tag: activity.tag,
  locationId: activity.locationId,
  venue: activity.venue,
  image: activity.image,
  schedule: { ...activity.schedule },
  joinMode: activity.joinMode,
  capacity: activity.capacity,
  status: activity.status === 'scheduled' ? 'published' : activity.status,
  publishAt: activity.publishAt,
});

// ---------- Joining and booking (Phase 3B) ----------
/*
 * Bookings are server records. A participation is one person on one
 * occurrence: an ongoing activity they joined (date '') or one date they
 * booked (date = the occurrence's original local date, its identity).
 */

/** Join an activity (date '') or book one of its dates. */
export const participationInputSchema = z
  .object({
    activityId: z.string().trim().min(1, 'Choose an activity.'),
    date: z
      .string()
      .trim()
      .refine((value) => value === '' || isIsoDate(value), {
        message: 'Choose a date.',
      }),
  })
  .strict();
export type ParticipationInput = z.infer<typeof participationInputSchema>;

/**
 * One of the signed-in person's own plans. `available` is false once the
 * activity is no longer published (the plan can still be cancelled);
 * `dateCancelled` is true when staff cancelled that date.
 */
export type MemberPlan = {
  id: string;
  activityId: string;
  date: string;
  createdAt: string;
  activity: { title: string; slug: string; kind: ActivityKind };
  available: boolean;
  dateCancelled: boolean;
};

/**
 * How many places are taken, by activity and then by date ('' for an
 * ongoing activity people join). Counts only, never who.
 */
export type Availability = Record<string, Record<string, number>>;

/** Someone on an activity's roster, as staff see it. */
export type RosterEntry = {
  id: string;
  date: string;
  name: string;
  email: string;
  status: 'active' | 'cancelled';
  createdAt: string;
  cancelledAt: string;
};

/** Places taken on one occurrence ('' for joining), from the counts. */
export const placesTaken = (
  availability: Availability,
  activityId: string,
  date = '',
) => availability[activityId]?.[date] ?? 0;

/** Places left, or null when the activity has no limit. */
export const placesLeft = (
  activity: Pick<Activity, 'id' | 'capacity' | 'joinMode'>,
  availability: Availability,
  date = '',
) =>
  activity.capacity == null
    ? null
    : Math.max(
        0,
        activity.capacity -
          placesTaken(
            availability,
            activity.id,
            activity.joinMode === 'booking' ? date : '',
          ),
      );
