import { createHash } from 'node:crypto';
import {
  addDays,
  nzNow,
  occurrences,
  type ActivityException,
} from '@grace-abounds/validation';
import { prisma, Prisma } from '@grace-abounds/database';
import type { OutboxHandler } from './outbox.js';
import {
  CHURCH_TIME_ZONE,
  googleCalendar,
  googleCalendarConfig,
  googleEventId,
  type CalendarEvent,
  type CalendarProvider,
  CalendarError,
} from './google-calendar.js';
import { toActivity } from '../routes/activities.js';

/*
 * One-way public Google Calendar sync (Phase 3C).
 *
 * 1. Every activity save, date change, restore or delete writes a
 *    `calendar.sync` outbox event in the same transaction as the change.
 * 2. The outbox handler only marks that activity's CalendarSync row as
 *    wanted (fast, no Google call), so Google latency never holds the
 *    outbox transaction and a save never depends on Google.
 * 3. A worker sends wanted activities to Google, outside any long
 *    transaction, and records synced or failed (with the error and a
 *    backoff). Staff see the state and can retry.
 * 4. A sweep compares what Google should hold with what was sent, so a
 *    scheduled release (no save happens), the rolling window moving on, or
 *    any missed event is caught.
 *
 * What Google gets: each upcoming occurrence (the next DAYS_AHEAD days) of a
 * published, live activity as its own event with a stable id, built by the
 * app's own recurrence engine. A changed date updates that event; a
 * cancelled date, an unpublished or deleted activity removes upcoming
 * events. Past events are left as they were. Google's recurring-events
 * guide doesn't define what happens to individually changed instances when
 * a whole series is updated, so series rules aren't used here; .ics exports
 * keep RRULE/EXDATE/RECURRENCE-ID, whose meaning the standard defines.
 *
 * Only public fields: title, summary, the date's note, place, times and a
 * link back. Never people, bookings, capacity, prayers or appointments.
 */

export { CALENDAR_SYNC, queueCalendarSync } from './calendar-queue.js';
export const DAYS_AHEAD = 180;
/** Calls to Google per activity per pass; the rest continues next pass. */
const PASS_LIMIT = 60;

type Tx = Prisma.TransactionClient;
type SyncedMap = Record<string, { id: string; h: string }>;
type Wanted = { date: string; id: string; event: CalendarEvent; h: string };

/** Marks an activity as wanted again; a newer request beats a running sync. */
export async function requestSync(
  activityId: string,
  client: Tx | typeof prisma = prisma,
) {
  await client.calendarSync.upsert({
    where: { activityId },
    // Times here always come from the app's clock (never a database
    // default), so the worker's "due" check compares like with like.
    create: { activityId, wanted: 1, nextAttemptAt: new Date() },
    update: {
      status: 'pending',
      wanted: { increment: 1 },
      attempts: 0,
      nextAttemptAt: new Date(),
    },
  });
}

/** Outbox handler: records the request; the worker talks to Google. */
export function calendarSyncRequester(): OutboxHandler {
  return async (events) => {
    for (const event of events) {
      const id = (event.payload as { activityId?: unknown } | null)?.activityId;
      if (typeof id === 'string' && id) await requestSync(id);
    }
  };
}

const plusMinutes = (date: string, time: string, minutes: number) => {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const day = addDays(date, Math.floor(total / 1440));
  const rest = total % 1440;
  return `${day}T${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}:00`;
};
const hash = (event: CalendarEvent) =>
  createHash('sha256').update(JSON.stringify(event)).digest('hex').slice(0, 20);

/** What Google should hold for this activity's upcoming dates. */
export async function wantedEvents(
  activityId: string,
  now = new Date(),
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '',
): Promise<Wanted[]> {
  const row = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { exceptions: true },
  });
  if (!row) return [];
  const activity = toActivity(row, now);
  // Drafts, scheduled (until their release), archived and undated
  // activities have nothing in Google.
  if (activity.status !== 'published' || activity.schedule.repeat === 'ongoing')
    return [];
  const campus = row.locationKey
    ? await prisma.location.findFirst({
        where: { key: row.locationKey, status: 'PUBLISHED' },
        select: { name: true, address: true },
      })
    : null;
  const today = nzNow(now).date;
  const exceptions: ActivityException[] = row.exceptions.map((item) => ({
    id: item.id,
    activityId: item.activityId,
    date: item.date.toISOString().slice(0, 10),
    kind: item.kind as ActivityException['kind'],
    note: item.note,
    startTime: item.startTime,
    endTime: item.endTime,
    venue: item.venue,
  }));
  const link = siteUrl
    ? `${siteUrl.replace(/\/$/, '')}/events/${activity.slug}`
    : '';
  return occurrences([activity], exceptions, today, addDays(today, DAYS_AHEAD))
    .filter((item) => !item.cancelled && item.startTime)
    .map((item) => {
      const end =
        item.endTime && item.endTime > item.startTime
          ? `${item.date}T${item.endTime}:00`
          : plusMinutes(item.date, item.startTime, 60);
      const event: CalendarEvent = {
        summary: activity.title,
        description: [activity.summary, item.note, link && `Details: ${link}`]
          .filter(Boolean)
          .join('\n\n'),
        location: [item.venue, campus?.name, campus?.address]
          .filter(Boolean)
          .join(', '),
        start: {
          dateTime: `${item.date}T${item.startTime}:00`,
          timeZone: CHURCH_TIME_ZONE,
        },
        end: { dateTime: end, timeZone: CHURCH_TIME_ZONE },
      };
      return {
        date: item.date,
        id: googleEventId(activity.id, item.date),
        event,
        h: hash(event),
      };
    });
}

const readSynced = (value: Prisma.JsonValue): SyncedMap =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as SyncedMap)
    : {};

/** Upcoming dates that differ between what Google should hold and what it has. */
function plan(wanted: Wanted[], synced: SyncedMap, today: string) {
  const byDate = new Map(wanted.map((item) => [item.date, item]));
  const upserts = wanted.filter((item) => synced[item.date]?.h !== item.h);
  const removals = Object.keys(synced).filter(
    (date) => date >= today && !byDate.has(date),
  );
  return { upserts, removals };
}

/**
 * One pass for one activity: sends at most PASS_LIMIT changes, saving
 * progress as it goes, so an outage part-way loses nothing and a retry
 * repeats nothing already confirmed. Returns whether it finished.
 */
export async function syncActivity(
  activityId: string,
  provider: CalendarProvider,
  now = new Date(),
) {
  const record = await prisma.calendarSync.findUnique({
    where: { activityId },
  });
  const synced = readSynced(record?.synced ?? {});
  const today = nzNow(now).date;
  // Past dates are history: forget them, never touch them in Google.
  for (const date of Object.keys(synced)) if (date < today) delete synced[date];
  const { upserts, removals } = plan(
    await wantedEvents(activityId, now),
    synced,
    today,
  );
  const save = () =>
    prisma.calendarSync.upsert({
      where: { activityId },
      create: { activityId, synced: synced as Prisma.InputJsonValue },
      update: { synced: synced as Prisma.InputJsonValue },
    });
  const work = removals.length + upserts.length;
  let done = 0;
  try {
    for (const date of removals) {
      if (done >= PASS_LIMIT) break;
      await provider.remove(synced[date]!.id);
      delete synced[date];
      done++;
    }
    for (const item of upserts) {
      if (done >= PASS_LIMIT) break;
      const id = await provider.upsert(
        synced[item.date]?.id ?? item.id,
        item.event,
      );
      synced[item.date] = { id, h: item.h };
      done++;
    }
  } finally {
    await save();
  }
  return done === work;
}

const backoffSeconds = (attempts: number, retryable: boolean) =>
  Math.min(retryable ? 30 * 2 ** attempts : 3600, 3600);

/** Claims due activities (a short lease), syncs them, records the outcome. */
export async function calendarSyncPass(
  provider: CalendarProvider,
  now = () => new Date(),
  limit = 5,
) {
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { activityId: string; wanted: number; attempts: number }[]
    >`
      SELECT "activityId", "wanted", "attempts" FROM "CalendarSync"
      WHERE "status" IN ('pending', 'failed') AND "nextAttemptAt" <= ${now()}
      ORDER BY "nextAttemptAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`;
    if (rows.length)
      await tx.calendarSync.updateMany({
        where: { activityId: { in: rows.map((row) => row.activityId) } },
        // A lease: if this process dies, another picks it up later.
        data: { nextAttemptAt: new Date(now().getTime() + 5 * 60_000) },
      });
    return rows;
  });
  for (const row of claimed) {
    try {
      const finished = await syncActivity(row.activityId, provider, now());
      // Done only if no newer change arrived while this ran.
      const marked = await prisma.calendarSync.updateMany({
        where: { activityId: row.activityId, wanted: row.wanted },
        data: finished
          ? {
              status: 'synced',
              attempts: 0,
              lastError: '',
              syncedAt: now(),
            }
          : { status: 'pending', nextAttemptAt: now() },
      });
      if (!marked.count)
        await prisma.calendarSync.update({
          where: { activityId: row.activityId },
          data: { status: 'pending', nextAttemptAt: now() },
        });
    } catch (error) {
      const known = error instanceof CalendarError;
      const message = known
        ? error.message
        : 'Sending to Google Calendar failed unexpectedly.';
      await prisma.calendarSync.update({
        where: { activityId: row.activityId },
        data: {
          status: 'failed',
          attempts: { increment: 1 },
          lastError: message.slice(0, 500),
          nextAttemptAt: new Date(
            now().getTime() +
              backoffSeconds(row.attempts, known ? error.retryable : true) *
                1000,
          ),
        },
      });
    }
  }
  return claimed.length;
}

/**
 * Finds activities whose Google events are out of date without any save:
 * a scheduled release passing, the window moving on, a first setup, or a
 * record the outbox never reached. Database only; no Google calls.
 */
export async function calendarSweep(now = new Date()) {
  const [activities, records] = await Promise.all([
    prisma.activity.findMany({ select: { id: true } }),
    prisma.calendarSync.findMany(),
  ]);
  const known = new Map(records.map((item) => [item.activityId, item]));
  const ids = new Set([...activities.map((item) => item.id), ...known.keys()]);
  const today = nzNow(now).date;
  let marked = 0;
  for (const id of ids) {
    const record = known.get(id);
    if (record && record.status !== 'synced') continue;
    const synced = readSynced(record?.synced ?? {});
    const { upserts, removals } = plan(
      await wantedEvents(id, now),
      synced,
      today,
    );
    if (!upserts.length && !removals.length) continue;
    await requestSync(id);
    marked++;
  }
  return marked;
}

export type CalendarSyncState = {
  configured: boolean;
  items: {
    activityId: string;
    status: 'pending' | 'synced' | 'failed';
    lastError: string;
    syncedAt: string;
    nextAttemptAt: string;
  }[];
};

export async function calendarSyncState(): Promise<CalendarSyncState> {
  const rows = await prisma.calendarSync.findMany({
    orderBy: { activityId: 'asc' },
  });
  return {
    configured: !!googleCalendarConfig(),
    items: rows.map((row) => ({
      activityId: row.activityId,
      status: row.status as 'pending' | 'synced' | 'failed',
      lastError: row.lastError,
      syncedAt: row.syncedAt?.toISOString() ?? '',
      nextAttemptAt: row.nextAttemptAt.toISOString(),
    })),
  };
}

/** Runs in the API process: sends every few seconds, sweeps every 10 min. */
export function startCalendarSync(
  log: { warn: (object: object, message: string) => void },
  provider: CalendarProvider | null = (() => {
    const config = googleCalendarConfig();
    return config ? googleCalendar(config) : null;
  })(),
) {
  let running = false;
  let lastSweep = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (Date.now() - lastSweep > 10 * 60_000) {
        lastSweep = Date.now();
        await calendarSweep();
      }
      // Without a configured calendar, changes wait as pending.
      if (provider) await calendarSyncPass(provider);
    } catch (error) {
      log.warn(
        { error: String((error as Error)?.message ?? error) },
        'Google Calendar sync pass failed; it will run again.',
      );
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 15_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
