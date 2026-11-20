import { randomUUID } from 'node:crypto';
import {
  lockUserSecurity,
  prisma,
  recordAudit,
  type Prisma,
} from '@grace-abounds/database';
import {
  EXPORT_RECORD_DAYS,
  EXPORT_TTL_DAYS,
  EXPORT_CONTENTS_NOTE,
} from '@grace-abounds/validation';
import { STORAGE_REMOVE } from './assets.js';
import { forgetNotifications, notify } from './notifications.js';
import { getStorage, PUT_TIMEOUT_MS, type Storage } from './storage.js';

/*
 * Personal data exports (Phase 5B). A request is a durable job row; the API
 * builds queued exports in the background into a private stored file,
 * marks it ready for EXPORT_TTL_DAYS and
 * tells its owner (in-app, plus email if they chose account updates). At
 * expiry the file is removed through the outbox and the row kept, without
 * personal data, for EXPORT_RECORD_DAYS. Files are named per build attempt:
 * exports/<userId>/<exportId>/<attempt>.json.
 *
 * Builds are retry-safe: a builder claims a row with a token and lease
 * (FOR UPDATE SKIP LOCKED); each attempt uploads its own file, recorded
 * before upload (DataExportFile); READY is written only by the current
 * claim holder for an account still active under its security lock; the
 * ready notification has a dedupe key. Surplus, failed and expired files
 * are removed through the outbox (see sweepExportFiles). A failed build is
 * retried with backoff, then marked failed.
 *
 * Contents are an explicit allowlist of the owner's own data (see
 * buildExport). Never whole database records, credentials, session tokens,
 * other people's details, the Pastor's private notes or staff-only fields.
 */

type Tx = Prisma.TransactionClient;
export const EXPORT_MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60_000;
const DAY = 86_400_000;
const iso = (value: Date | null | undefined) => value?.toISOString() ?? '';

/** The owner's own data, field by field. */
export async function buildExport(userId: string, now = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      name: true,
      phone: true,
      bio: true,
      role: true,
      status: true,
      createdAt: true,
      passwordHash: true,
      passwordUpdatedAt: true,
      accounts: { where: { provider: 'google' }, select: { provider: true } },
      authenticators: {
        select: { createdAt: true, credentialDeviceType: true },
      },
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: now } },
        select: {
          method: true,
          deviceLabel: true,
          createdAt: true,
          lastSeenAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      notificationPreference: {
        select: { emailCare: true, emailAccount: true, updatedAt: true },
      },
      participations: {
        select: {
          dateKey: true,
          status: true,
          createdAt: true,
          cancelledAt: true,
          activity: { select: { title: true, kind: true } },
          events: {
            select: { action: true, actorId: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      prayerRequests: {
        select: {
          text: true,
          status: true,
          createdAt: true,
          closedAt: true,
          events: {
            select: { status: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      appointments: {
        select: {
          topic: true,
          reason: true,
          preferredDate: true,
          preferredTime: true,
          startsAt: true,
          endsAt: true,
          location: true,
          status: true,
          createdAt: true,
          closedAt: true,
          events: {
            select: {
              status: true,
              startsAt: true,
              endsAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      notifications: {
        select: {
          title: true,
          body: true,
          href: true,
          createdAt: true,
          readAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  const lower = (value: string) => value.toLowerCase();
  return {
    format: 'grace-abounds-personal-data',
    formatVersion: 1,
    generatedAt: now.toISOString(),
    about: EXPORT_CONTENTS_NOTE,
    account: {
      id: user.id,
      email: user.email,
      emailVerified: !!user.emailVerified,
      name: user.name ?? '',
      phone: user.phone,
      bio: user.bio,
      role: lower(user.role),
      status: lower(user.status),
      createdAt: iso(user.createdAt),
    },
    signInMethods: {
      password: !!user.passwordHash,
      passwordUpdatedAt: iso(user.passwordUpdatedAt),
      google: user.accounts.length > 0,
      passkeys: user.authenticators.map((item) => ({
        deviceType: item.credentialDeviceType,
        addedAt: iso(item.createdAt),
      })),
    },
    signedInDevices: user.sessions.map((item) => ({
      method: item.method,
      device: item.deviceLabel,
      signedInAt: iso(item.createdAt),
      lastSeenAt: iso(item.lastSeenAt),
    })),
    notificationSettings: {
      emailPrayerAndAppointmentUpdates:
        user.notificationPreference?.emailCare ?? false,
      emailAccountUpdates: user.notificationPreference?.emailAccount ?? false,
      inAppUpdates: 'always on',
      securityEmails: 'always sent',
    },
    bookings: user.participations.map((item) => ({
      activity: item.activity.title,
      kind: item.activity.kind,
      date: item.dateKey,
      status: lower(item.status),
      createdAt: iso(item.createdAt),
      cancelledAt: iso(item.cancelledAt),
      history: item.events.map((event) => ({
        action: event.action,
        // Who acted, without naming anyone else.
        by: !event.actorId
          ? 'church'
          : event.actorId === user.id
            ? 'you'
            : 'church staff',
        at: iso(event.createdAt),
      })),
    })),
    prayerRequests: user.prayerRequests.map((item) => ({
      text: item.text,
      status: lower(item.status),
      createdAt: iso(item.createdAt),
      closedAt: iso(item.closedAt),
      history: item.events.map((event) => ({
        status: lower(event.status),
        at: iso(event.createdAt),
      })),
    })),
    appointments: user.appointments.map((item) => ({
      topic: item.topic,
      message: item.reason,
      preferredDate: item.preferredDate?.toISOString().slice(0, 10) ?? '',
      preferredTime: item.preferredTime,
      startsAt: iso(item.startsAt),
      endsAt: iso(item.endsAt),
      location: item.location,
      status: lower(item.status),
      createdAt: iso(item.createdAt),
      closedAt: iso(item.closedAt),
      history: item.events.map((event) => ({
        status: lower(event.status),
        startsAt: iso(event.startsAt),
        endsAt: iso(event.endsAt),
        at: iso(event.createdAt),
      })),
    })),
    notifications: user.notifications.map((item) => ({
      title: item.title,
      body: item.body,
      link: item.href,
      createdAt: iso(item.createdAt),
      read: !!item.readAt,
    })),
  };
}

/**
 * Each build attempt writes its own file (immutable per claim), so a slow
 * or abandoned attempt can never overwrite or bring back the file another
 * attempt made ready, nor one that has expired.
 */
export const exportKey = (userId: string, id: string, attempt: string) =>
  `exports/${userId}/${id}/${attempt}.json`;

/** Removes a tracked export file: outbox removal (retried) + marked. */
/**
 * Removes a tracked export file: marks it and queues an outbox removal
 * (retried). `uploaded` is for the attempt that has just uploaded it: its
 * removal is queued even if the file was already marked (swept while the
 * upload was still landing), so a late upload is removed straight away.
 */
async function discardFile(tx: Tx, key: string, now: Date, uploaded = false) {
  const marked = await tx.dataExportFile.updateMany({
    where: { key, removedAt: null },
    data: { removedAt: now },
  });
  if (marked.count || uploaded)
    await tx.outboxEvent.create({
      data: { topic: STORAGE_REMOVE, payload: { key } },
    });
}

/**
 * Locks one export row for the rest of the transaction. Finalizing a build
 * and sweeping its files both take it (after the owner's security lock,
 * when that is taken too), so they never interleave.
 */
async function lockExport(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<
    {
      status: string;
      storageKey: string | null;
      claimToken: string | null;
      leaseUntil: Date | null;
    }[]
  >`
    SELECT "status", "storageKey", "claimToken", "leaseUntil"
    FROM "DataExport" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

type Options = {
  storage?: Storage | null;
  now?: () => Date;
  limit?: number;
  /** Tests only: runs between upload and finalizing (simulates a crash). */
  afterUpload?: (key: string) => Promise<void>;
};

/**
 * Builds due exports (queued and available, or abandoned mid-build). One
 * row per claim; returns how many were claimed.
 *
 * Every file is recorded (DataExportFile) before it is uploaded, so no
 * upload is ever untracked. Finalizing re-checks, under the owner's
 * security lock, that the account is still active and this attempt still
 * holds the claim; otherwise the export is not made ready, nobody is told,
 * and this attempt's file is queued for removal at once. A file left behind
 * by a crash between upload and finalizing is removed by sweepExportFiles.
 */
export async function processExports(options: Options = {}) {
  const storage =
    options.storage === undefined ? getStorage() : options.storage;
  const clock = options.now ?? (() => new Date());
  if (!storage) return 0;
  let processed = 0;
  for (let count = 0; count < (options.limit ?? 5); count++) {
    const now = clock();
    const token = randomUUID();
    const claimed = await prisma.$queryRaw<
      { id: string; userId: string; attempts: number }[]
    >`
      UPDATE "DataExport" SET
        "status" = 'BUILDING', "claimToken" = ${token},
        "leaseUntil" = ${new Date(now.getTime() + LEASE_MS)},
        "attempts" = "attempts" + 1, "updatedAt" = ${now}
      WHERE "id" = (
        SELECT "id" FROM "DataExport"
        WHERE ("status" = 'QUEUED' AND "availableAt" <= ${now})
           OR ("status" = 'BUILDING' AND "leaseUntil" < ${now})
        ORDER BY "createdAt"
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
      RETURNING "id", "userId", "attempts"`;
    const job = claimed[0];
    if (!job) break;
    processed++;
    const mine = { id: job.id, claimToken: token, status: 'BUILDING' as const };
    const fail = (tx: Tx | typeof prisma) =>
      tx.dataExport.updateMany({
        where: mine,
        data: {
          status: 'FAILED',
          finishedAt: now,
          claimToken: null,
          leaseUntil: null,
        },
      });
    try {
      const owner = await prisma.user.findUnique({
        where: { id: job.userId },
        select: { status: true },
      });
      if (owner?.status !== 'ACTIVE') {
        await fail(prisma);
        continue;
      }
      const data = await buildExport(job.userId, now);
      const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
      const key = exportKey(job.userId, job.id, token);
      // Record the file before uploading it, while still holding the claim.
      const tracked = await prisma.$transaction(async (tx) => {
        const held = await tx.dataExport.updateMany({
          where: mine,
          data: { leaseUntil: new Date(clock().getTime() + LEASE_MS) },
        });
        if (held.count === 0) return false;
        await tx.dataExportFile.create({
          data: { key, exportId: job.id, userId: job.userId },
        });
        return true;
      });
      if (!tracked) continue;
      await storage.put(key, bytes, 'application/json');
      await options.afterUpload?.(key);
      await prisma.$transaction(async (tx) => {
        const at = clock();
        // Serialized with the owner's suspension, deletion and sign-ins,
        // then with sweeping this export's files (same order everywhere).
        await lockUserSecurity(tx, job.userId);
        await lockExport(tx, job.id);
        const current = await tx.user.findUnique({
          where: { id: job.userId },
          select: { status: true },
        });
        if (current?.status !== 'ACTIVE') {
          await fail(tx);
          await discardFile(tx, key, at, true);
          return;
        }
        const file = await tx.dataExportFile.findUnique({ where: { key } });
        if (!file || file.removedAt) {
          // This attempt's file was already swept (its lease had run out):
          // never make it ready; build again if this attempt still owns it.
          await tx.dataExport.updateMany({
            where: mine,
            data: {
              status: 'QUEUED',
              availableAt: at,
              claimToken: null,
              leaseUntil: null,
            },
          });
          await discardFile(tx, key, at, true);
          return;
        }
        const ready = await tx.dataExport.updateMany({
          where: mine,
          data: {
            status: 'READY',
            storageKey: key,
            size: bytes.length,
            readyAt: now,
            expiresAt: new Date(now.getTime() + EXPORT_TTL_DAYS * DAY),
            claimToken: null,
            leaseUntil: null,
          },
        });
        if (ready.count === 0) {
          // Another attempt took over (lease ended): this file is surplus.
          await discardFile(tx, key, at, true);
          return;
        }
        await notify(tx, {
          userIds: [job.userId],
          kind: 'export.ready',
          title: 'Your data export is ready',
          body: `Download it from Settings within ${EXPORT_TTL_DAYS} days.`,
          href: '/settings#data',
          entityType: 'data_export',
          entityId: job.id,
          dedupe: `export:${job.id}:ready`,
        });
        await recordAudit(tx, {
          actorId: null,
          action: 'account.export_ready',
          entityType: 'DataExport',
          entityId: job.id,
          metadata: { size: bytes.length },
        });
      });
    } catch {
      const giveUp = job.attempts >= EXPORT_MAX_ATTEMPTS;
      await prisma.dataExport.updateMany({
        where: mine,
        data: giveUp
          ? {
              status: 'FAILED',
              finishedAt: now,
              claimToken: null,
              leaseUntil: null,
            }
          : {
              status: 'QUEUED',
              availableAt: new Date(
                now.getTime() + Math.min(2 ** job.attempts, 60) * 60_000,
              ),
              claimToken: null,
              leaseUntil: null,
            },
      });
      // Any file this attempt uploaded is left to sweepExportFiles.
    }
  }
  return processed;
}

/**
 * Ends ready exports at their expiry (file removal queued through the
 * outbox, so a storage outage is retried), and removes old failed/expired
 * records.
 */
export async function expireExports(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const due = await tx.dataExport.findMany({
      where: { status: 'READY', expiresAt: { lte: now } },
      select: { id: true, storageKey: true },
    });
    for (const row of due) {
      const changed = await tx.dataExport.updateMany({
        where: { id: row.id, status: 'READY' },
        data: { status: 'EXPIRED', storageKey: null, finishedAt: now },
      });
      if (changed.count && row.storageKey)
        await discardFile(tx, row.storageKey, now);
    }
    if (due.length)
      await forgetNotifications(
        tx,
        'data_export',
        due.map((row) => row.id),
      );
    const old = await tx.dataExport.deleteMany({
      where: {
        status: { in: ['FAILED', 'EXPIRED'] },
        finishedAt: { lte: new Date(now.getTime() - EXPORT_RECORD_DAYS * DAY) },
      },
    });
    return { expired: due.length, removed: old.count };
  });
}

/**
 * Ends every export of an account being deleted (Phase 5C), inside the
 * deletion's transaction, which already holds the owner's security lock
 * (so the lock order matches finalizing): queued or building ones fail (a
 * builder still running is refused at finalizing), ready ones expire with
 * their file queued for removal. Returns how many were ended.
 */
export async function endAccountExports(tx: Tx, userId: string, now: Date) {
  const rows = await tx.dataExport.findMany({
    where: { userId, status: { in: ['QUEUED', 'BUILDING', 'READY'] } },
    select: { id: true },
  });
  for (const { id } of rows) {
    const row = await lockExport(tx, id);
    if (!row) continue;
    if (row.status === 'READY') {
      await tx.dataExport.update({
        where: { id },
        data: { status: 'EXPIRED', storageKey: null, finishedAt: now },
      });
      if (row.storageKey) await discardFile(tx, row.storageKey, now);
    } else if (row.status === 'QUEUED' || row.status === 'BUILDING')
      await tx.dataExport.update({
        where: { id },
        data: {
          status: 'FAILED',
          finishedAt: now,
          claimToken: null,
          leaseUntil: null,
        },
      });
  }
  if (rows.length)
    await forgetNotifications(
      tx,
      'data_export',
      rows.map((row) => row.id),
    );
  return rows.length;
}

/** Files are only swept once any upload for them must have finished. */
export const FILE_SWEEP_GRACE_MS = LEASE_MS + PUT_TIMEOUT_MS + 60_000;
/** Removed files are re-checked this long, in case a late upload landed. */
const FILE_WATCH_MS = DAY;

/**
 * Cleans up export files nothing points to: those of failed or crashed
 * attempts, takeovers, removed exports and expired ones. Never the ready
 * file, and never the file of the attempt currently holding a live lease
 * (however old the file), each re-checked under the export's row lock. Each is queued for
 * removal and marked; for a day afterwards a removed file is checked again
 * and re-removed if a late upload brought it back; then its record goes.
 */
export async function sweepExportFiles(
  options: {
    storage?: Storage | null;
    now?: Date;
    /** Tests only: runs after choosing candidates, before each removal. */
    beforeDiscard?: (key: string) => Promise<void>;
  } = {},
) {
  const storage =
    options.storage === undefined ? getStorage() : options.storage;
  const now = options.now ?? new Date();
  const candidates = await prisma.$queryRaw<
    { key: string; exportId: string; userId: string }[]
  >`
    SELECT f."key", f."exportId", f."userId" FROM "DataExportFile" f
    LEFT JOIN "DataExport" e ON e."id" = f."exportId"
    WHERE f."removedAt" IS NULL
      AND f."createdAt" < ${new Date(now.getTime() - FILE_SWEEP_GRACE_MS)}
      AND (e."id" IS NULL OR e."storageKey" IS DISTINCT FROM f."key")`;
  let removed = 0;
  for (const candidate of candidates) {
    await options.beforeDiscard?.(candidate.key);
    // Decided again under the export's lock: it may have become ready, or
    // be the live attempt of a builder still holding its lease.
    const discarded = await prisma.$transaction(async (tx) => {
      const row = await lockExport(tx, candidate.exportId);
      const file = await tx.dataExportFile.findUnique({
        where: { key: candidate.key },
      });
      if (!file || file.removedAt) return false;
      if (row?.storageKey === candidate.key) return false;
      const live =
        row?.status === 'BUILDING' &&
        !!row.claimToken &&
        exportKey(candidate.userId, candidate.exportId, row.claimToken) ===
          candidate.key &&
        !!row.leaseUntil &&
        row.leaseUntil > now;
      if (live) return false;
      await discardFile(tx, candidate.key, now);
      return true;
    });
    if (discarded) removed++;
  }
  let reappeared = 0;
  if (storage) {
    const watched = await prisma.dataExportFile.findMany({
      where: {
        removedAt: {
          lt: new Date(now.getTime() - 5 * 60_000),
          gt: new Date(now.getTime() - FILE_WATCH_MS),
        },
      },
      select: { key: true },
    });
    for (const { key } of watched)
      if (await storage.head(key)) {
        reappeared++;
        await prisma.outboxEvent.create({
          data: { topic: STORAGE_REMOVE, payload: { key } },
        });
      }
  }
  const forgotten = await prisma.dataExportFile.deleteMany({
    where: { removedAt: { lte: new Date(now.getTime() - FILE_WATCH_MS) } },
  });
  return {
    removed,
    reappeared,
    forgotten: forgotten.count,
  };
}

type Log = { warn: (object: object, message: string) => void };
/**
 * Builds exports every 15 seconds; expires them and sweeps stray files
 * every 15 minutes.
 */
export function startDataExports(log: Log) {
  let building = false;
  const build = setInterval(() => {
    if (building) return;
    building = true;
    processExports()
      .catch((error) => log.warn({ err: error }, 'Data export build failed.'))
      .finally(() => {
        building = false;
      });
  }, 15_000);
  const tidy = () =>
    expireExports()
      .then(() => sweepExportFiles())
      .catch((error) =>
        log.warn({ err: error }, 'Data export cleanup failed.'),
      );
  void tidy();
  const cleanup = setInterval(tidy, 15 * 60_000);
  build.unref();
  cleanup.unref();
  return () => {
    clearInterval(build);
    clearInterval(cleanup);
  };
}
