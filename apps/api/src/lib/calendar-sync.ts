import { createHash, randomUUID } from 'node:crypto';
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
 * 3. A worker claims one wanted activity at a time (a claim token with a
 *    renewed lease, separate from retry scheduling), sends to Google
 *    outside any long transaction, and records synced or failed (with the
 *    error and a backoff). Every progress and outcome write requires the
 *    claim, so a sender whose claim expired can't overwrite a newer one,
 *    and a newer save never lets a second sender in while one is working.
 *    Staff see the state and can retry.
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

import { CALENDAR_SYNC } from './calendar-queue.js';
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
 * How long a claim lasts unless renewed. A working sender renews it before
 * every Google call and, while a call is in flight, every HEARTBEAT_MS (a
 * call can take several requests with retries), so it keeps its claim
 * however long Google takes; a crashed sender's claim simply expires.
 */
export const LEASE_MS = 3 * 60_000;
const HEARTBEAT_MS = 30_000;
export type SyncTiming = { leaseMs: number; heartbeatMs: number };
const defaultTiming: SyncTiming = {
  leaseMs: LEASE_MS,
  heartbeatMs: HEARTBEAT_MS,
};

/** This sender's claim expired and another took over: stop, write nothing. */
class LostClaim extends Error {}

export type Claim = {
  activityId: string;
  token: string;
  /** The change generation this delivery started from. */
  wanted: number;
  attempts: number;
};

/**
 * Claims one due activity, right before sending it. The claim is separate
 * from retry scheduling: a newer save makes the row due again but never
 * frees a claim another sender still holds.
 */
export async function claimNext(
  now: Date,
  leaseMs = LEASE_MS,
): Promise<Claim | null> {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<
      { activityId: string; wanted: number; attempts: number }[]
    >`
      SELECT "activityId", "wanted", "attempts" FROM "CalendarSync"
      WHERE "status" IN ('pending', 'failed') AND "nextAttemptAt" <= ${now}
        AND ("claimedUntil" IS NULL OR "claimedUntil" < ${now})
      ORDER BY "nextAttemptAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED`;
    if (!row) return null;
    const token = randomUUID();
    await tx.calendarSync.update({
      where: { activityId: row.activityId },
      data: {
        claimToken: token,
        claimedUntil: new Date(now.getTime() + leaseMs),
      },
    });
    return { ...row, token };
  });
}

/** Writes only while this sender still holds its claim. */
async function guarded(
  claim: Claim,
  data: Prisma.CalendarSyncUpdateManyMutationInput,
  also: Prisma.CalendarSyncWhereInput = {},
) {
  const result = await prisma.calendarSync.updateMany({
    where: { activityId: claim.activityId, claimToken: claim.token, ...also },
    data,
  });
  return result.count > 0;
}

/**
 * Runs one Google call while renewing the claim every heartbeat (token-
 * guarded, one renewal at a time, stopped when the call ends). If the claim
 * was lost meanwhile, the call's result is not recorded.
 */
async function withHeartbeat<T>(
  claim: Claim,
  timing: SyncTiming,
  now: () => Date,
  work: () => Promise<T>,
): Promise<T> {
  let lost = false;
  let beating: Promise<void> = Promise.resolve();
  const timer = setInterval(() => {
    beating = beating
      .then(() =>
        guarded(claim, {
          claimedUntil: new Date(now().getTime() + timing.leaseMs),
        }),
      )
      .then((kept) => {
        if (!kept) lost = true;
      })
      .catch(() => {
        // A renewal that couldn't reach the database: the next one retries.
      });
  }, timing.heartbeatMs);
  let result: T;
  try {
    result = await work();
  } finally {
    clearInterval(timer);
    await beating;
  }
  if (lost) throw new LostClaim();
  return result;
}

/**
 * One pass for one claimed activity: sends at most PASS_LIMIT changes.
 * Before each Google call it saves the progress so far and renews the
 * claim, both only if the claim is still its own, so an outage part-way
 * loses nothing, a retry repeats nothing confirmed, and a sender that lost
 * its claim stops before touching Google again. Returns whether it finished.
 */
export async function syncActivity(
  claim: Claim,
  provider: CalendarProvider,
  now: () => Date = () => new Date(),
  timing: SyncTiming = defaultTiming,
) {
  const record = await prisma.calendarSync.findUnique({
    where: { activityId: claim.activityId },
  });
  if (record?.claimToken !== claim.token) throw new LostClaim();
  const synced = readSynced(record.synced);
  const today = nzNow(now()).date;
  // Past dates are history: forget them, never touch them in Google.
  for (const date of Object.keys(synced)) if (date < today) delete synced[date];
  const { upserts, removals } = plan(
    await wantedEvents(claim.activityId, now()),
    synced,
    today,
  );
  const save = () =>
    guarded(claim, {
      synced: synced as Prisma.InputJsonValue,
      claimedUntil: new Date(now().getTime() + timing.leaseMs),
    });
  const call = <T>(work: () => Promise<T>) =>
    withHeartbeat(claim, timing, now, work);
  const work = removals.length + upserts.length;
  let done = 0;
  try {
    for (const date of removals) {
      if (done >= PASS_LIMIT) break;
      if (!(await save())) throw new LostClaim();
      await call(() => provider.remove(synced[date]!.id));
      delete synced[date];
      done++;
    }
    for (const item of upserts) {
      if (done >= PASS_LIMIT) break;
      if (!(await save())) throw new LostClaim();
      const id = await call(() =>
        provider.upsert(synced[item.date]?.id ?? item.id, item.event),
      );
      synced[item.date] = { id, h: item.h };
      done++;
    }
  } catch (error) {
    // Keep what Google confirmed before the failure (if still ours).
    if (!(error instanceof LostClaim)) await save();
    throw error;
  }
  if (!(await save())) throw new LostClaim();
  return done === work;
}

const backoffSeconds = (attempts: number, retryable: boolean) =>
  Math.min(retryable ? 30 * 2 ** attempts : 3600, 3600);
const release = { claimToken: null, claimedUntil: null };

/** Delivers one claimed activity and records the outcome, if still its own. */
export async function deliverClaim(
  claim: Claim,
  provider: CalendarProvider,
  now: () => Date = () => new Date(),
  timing: SyncTiming = defaultTiming,
) {
  try {
    const finished = await syncActivity(claim, provider, now, timing);
    // Synced only if no newer change arrived meanwhile; otherwise due now.
    const synced =
      finished &&
      (await guarded(
        claim,
        {
          status: 'synced',
          attempts: 0,
          lastError: '',
          syncedAt: now(),
          ...release,
        },
        { wanted: claim.wanted },
      ));
    if (!synced)
      await guarded(claim, {
        status: 'pending',
        nextAttemptAt: now(),
        ...release,
      });
  } catch (error) {
    // Another sender owns it now: its outcome stands, not this one's.
    if (error instanceof LostClaim) return;
    const known = error instanceof CalendarError;
    const lastError = (
      known ? error.message : 'Sending to Google Calendar failed unexpectedly.'
    ).slice(0, 500);
    const backedOff = await guarded(
      claim,
      {
        status: 'failed',
        attempts: { increment: 1 },
        lastError,
        nextAttemptAt: new Date(
          now().getTime() +
            backoffSeconds(claim.attempts, known ? error.retryable : true) *
              1000,
        ),
        ...release,
      },
      { wanted: claim.wanted },
    );
    // A newer change arrived while this failed: try it promptly.
    if (!backedOff)
      await guarded(claim, {
        status: 'pending',
        attempts: { increment: 1 },
        lastError,
        nextAttemptAt: now(),
        ...release,
      });
  }
}

/** Claims and delivers due activities one at a time, up to `limit`. */
export async function calendarSyncPass(
  provider: CalendarProvider,
  now: () => Date = () => new Date(),
  limit = 5,
  timing: SyncTiming = defaultTiming,
) {
  let handled = 0;
  for (; handled < limit; handled++) {
    const claim = await claimNext(now(), timing.leaseMs);
    if (!claim) break;
    await deliverClaim(claim, provider, now, timing);
  }
  return handled;
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
  // One consistent snapshot of both tables: a change can't slip from the
  // outbox to its row between the two reads and be missed by both.
  const [rows, queued] = await prisma.$transaction(
    async (tx) =>
      [
        await tx.calendarSync.findMany({ orderBy: { activityId: 'asc' } }),
        // A change still in the outbox hasn't reached its row yet: it is
        // pending, whatever the row says, so "up to date" is never early.
        await tx.outboxEvent.findMany({
          where: { topic: CALENDAR_SYNC, processedAt: null },
          select: { payload: true },
        }),
      ] as const,
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  const waiting = new Set(
    queued
      .map(
        (event) =>
          (event.payload as { activityId?: unknown } | null)?.activityId,
      )
      .filter((id): id is string => typeof id === 'string'),
  );
  const items: CalendarSyncState['items'] = rows.map((row) => ({
    activityId: row.activityId,
    status: waiting.has(row.activityId)
      ? 'pending'
      : (row.status as 'pending' | 'synced' | 'failed'),
    lastError: row.lastError,
    syncedAt: row.syncedAt?.toISOString() ?? '',
    nextAttemptAt: row.nextAttemptAt.toISOString(),
  }));
  for (const activityId of waiting)
    if (!rows.some((row) => row.activityId === activityId))
      items.push({
        activityId,
        status: 'pending',
        lastError: '',
        syncedAt: '',
        nextAttemptAt: '',
      });
  return { configured: !!googleCalendarConfig(), items };
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
