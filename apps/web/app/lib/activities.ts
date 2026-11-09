/**
 * Activities: one model for services, connect groups, Bible studies, events
 * and ministry teams, plus the calendar engine that turns their schedules
 * into dated occurrences.
 *
 * All dates and times are New Zealand wall-clock values (Pacific/Auckland):
 * dates are 'YYYY-MM-DD', times 'HH:mm'. Storing local times (not UTC
 * instants) keeps a 10:00am service at 10:00am across daylight saving.
 */
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

// ---------- Validation ----------
export function validateActivity(activity: Activity, all: Activity[]) {
  const errors: string[] = [];
  const { schedule } = activity;
  if (!activity.title.trim()) errors.push('Add a title.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(activity.slug))
    errors.push('URL slug must be lowercase letters, numbers and hyphens.');
  if (
    all.some((item) => item.id !== activity.id && item.slug === activity.slug)
  )
    errors.push('Another activity already uses this URL slug.');
  if (schedule.repeat !== 'ongoing') {
    if (!isIsoDate(schedule.date))
      errors.push(
        schedule.repeat === 'once' ? 'Choose a date.' : 'Choose a start date.',
      );
    if (!schedule.startTime) errors.push('Choose a start time.');
    if (schedule.endTime && schedule.endTime <= schedule.startTime)
      errors.push('End time must be after the start time.');
    if (schedule.until && schedule.until < schedule.date)
      errors.push('End date must be after the start date.');
  }
  if (
    ['weekly', 'fortnightly'].includes(schedule.repeat) &&
    !schedule.days.length
  )
    errors.push('Choose at least one day of the week.');
  if (
    activity.capacity != null &&
    (!Number.isInteger(activity.capacity) || activity.capacity < 1)
  )
    errors.push('Capacity must be a whole number of 1 or more, or blank.');
  if (activity.status === 'scheduled' && !activity.publishAt)
    errors.push('Choose when this activity goes live.');
  if (
    activity.image &&
    !/^\/images\/[^\s]+$/.test(activity.image) &&
    !/^https:\/\/images\.unsplash\.com\/[^\s]+$/.test(activity.image)
  )
    errors.push('Image must be a /images/ path or images.unsplash.com URL.');
  return errors;
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

/**
 * Where activities are mirrored for staff calendars. The site keeps its own
 * records (capacity, members, bookings); a provider only holds the schedule.
 *
 * - Google: events.insert/patch with recurrence [`RRULE:${toRRule()}`] and
 *   timeZone 'Pacific/Auckland'; cancel a date by patching that instance.
 * - Microsoft 365: POST /me/events with recurrence toGraphRecurrence();
 *   cancel a date by cancelling that occurrence.
 * Both need OAuth tokens held on the server, so they are added with the
 * backend. Until then the local provider keeps everything in this browser.
 */
export interface ActivityCalendarProvider {
  name: 'local' | 'google' | 'microsoft';
  sync(
    activity: Activity,
    exceptions: ActivityException[],
  ): Promise<{ externalId?: string }>;
  remove(activity: Activity): Promise<void>;
}
export const localCalendarProvider: ActivityCalendarProvider = {
  name: 'local',
  async sync(activity) {
    return { externalId: activity.externalId };
  },
  async remove() {},
};

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
