import { randomUUID } from 'node:crypto';
import {
  prisma,
  recordAudit,
  Role,
  type Prisma,
  type RetentionRun,
  type RetentionRunStage,
} from '@grace-abounds/database';
import {
  AUDIT_RETENTION_RULE,
  auditCutoff,
  nzLocalToUtc,
  nzNow,
  type RetentionHoldItem,
  type RetentionPreview,
  type RetentionRunSummary,
} from '@grace-abounds/validation';
import { AppError, forbidden } from './errors.js';
import { lockAndRecheck, type Actor } from './identity.js';
import {
  countDueAccounts,
  countDueAudit,
  deletionExecutionAllowed,
  purgeNextDue,
  requireDeletionAllowed,
  trimAuditBatch,
  trimDeletionBatch,
} from './account-deletion.js';
import { lockRetentionGate, retentionPause } from './retention-holds.js';
import { personName } from './display-name.js';

/*
 * "Delete eligible records now" (Phase 5C, owner policy 21 November 2026):
 * staff remove records that are already due, and only those, never a
 * clear-all and never anything under a records hold:
 *
 *   - deleted accounts whose 30 days have passed (with everything kept for
 *     them), and
 *   - activity (audit and security) records whose calendar-year retention
 *     has ended (auditCutoff), with purged deletion records of that age.
 *
 * Each press is one durable job (RetentionRun), following the export
 * pipeline's claim conventions:
 *
 *   - Identity: the page sends a request key, reused on every retry, so a
 *     retry reports a finished run or resumes an unfinished one instead of
 *     starting another (unique per staff member and key).
 *   - Ownership: each attempt holds a claim token. Every destructive
 *     transaction takes the retention gate, re-checks the acting staff
 *     member (session still valid, still an active Pastor or Admin), locks
 *     the run row and checks the token before deleting anything, and
 *     renews the lease. An attempt whose lease ran out can be taken over
 *     (same key) or is fenced off (another press marks it abandoned); the
 *     old attempt then stops at its next transaction and never finishes.
 *   - Progress: the stage and exact counts are saved in the same
 *     transaction as each deletion, so a failed or abandoned run reports
 *     exactly what it removed, and a resumed run carries on from its stage.
 *   - Bounded: at most ACCOUNT_BATCH accounts and AUDIT_BATCHES batches of
 *     activity entries per attempt; the result says when more remain.
 *
 * The preview counts what is due and what a hold keeps back, never
 * contents. Stored files of purged accounts are removed afterwards through
 * the outbox and the export/photo sweeps.
 *
 * REAL EXECUTION IS DISABLED with account deletion (see account-deletion):
 * the preview works; a run answers 503 outside the test suite.
 */

const RETENTION_LOCK = 7_204_201;
const LEASE_MS = 10 * 60_000;
const ACCOUNT_BATCH = 50;
const AUDIT_BATCH = 500;
const AUDIT_BATCHES = 40;
const STAFF: Role[] = [Role.PASTOR, Role.ADMIN];

type Tx = Prisma.TransactionClient;
type Claim = { id: string; token: string };
type Result = {
  held: RetentionRunSummary['held'];
  more: boolean;
};

/** This attempt no longer owns its run (taken over or fenced off). */
class Fenced extends Error {}

const running = () =>
  new AppError(
    409,
    'RETENTION_RUNNING',
    'A clean-up is already running. Check back in a few minutes.',
  );
const takenOver = () =>
  new AppError(
    409,
    'RETENTION_TAKEN_OVER',
    'This clean-up was continued by a newer request. Reload to see the result.',
  );

export function toRunSummary(run: RetentionRun): RetentionRunSummary {
  const result = (run.result ?? {}) as Partial<Result>;
  return {
    id: run.id,
    status: run.status.toLowerCase() as RetentionRunSummary['status'],
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? '',
    attempts: run.attempts,
    removed: {
      deletedAccounts: run.removedAccounts,
      auditEvents: run.removedAuditEvents,
      deletionRecords: run.removedDeletionRecords,
    },
    held: result.held ?? { deletedAccounts: 0, auditEvents: 0 },
    more: result.more ?? false,
  };
}

export async function retentionPreview(
  now = new Date(),
): Promise<RetentionPreview> {
  const [accounts, audit, active, overdue, last] = await Promise.all([
    countDueAccounts(prisma, now),
    countDueAudit(prisma, now),
    prisma.retentionHold.count({ where: { releasedAt: null } }),
    // Overdue: its review date (NZ) is before today, as in listHolds.
    prisma.retentionHold.count({
      where: {
        releasedAt: null,
        reviewBy: { lt: nzLocalToUtc(nzNow(now).date, '00:00') },
      },
    }),
    prisma.retentionRun.findFirst({ orderBy: { startedAt: 'desc' } }),
  ]);
  return {
    enabled: deletionExecutionAllowed(),
    auditRule: AUDIT_RETENTION_RULE,
    auditCutoff: auditCutoff(now).toISOString(),
    due: {
      deletedAccounts: accounts.due,
      auditEvents: audit.events,
      deletionRecords: audit.deletions,
    },
    held: { deletedAccounts: accounts.held, auditEvents: audit.heldEvents },
    holds: { active, overdue },
    lastRun: last ? toRunSummary(last) : null,
  };
}

/** The acting session is valid (recent, if asked) and still fixed staff. */
async function recheckStaff(tx: Tx, actor: Actor, requireRecent: boolean) {
  await lockAndRecheck(tx, actor, { requireRecent });
  const self = await tx.user.findUnique({
    where: { id: actor.id },
    select: { role: true, status: true },
  });
  if (!self || !STAFF.includes(self.role) || self.status !== 'ACTIVE')
    throw forbidden();
}

/**
 * Inside a destructive transaction, after the retention gate and before
 * any deletion: the acting staff member is still allowed, and this attempt
 * still owns the run (row locked, so a takeover waits or has happened).
 */
async function fence(tx: Tx, actor: Actor, claim: Claim) {
  await recheckStaff(tx, actor, false);
  const [row] = await tx.$queryRaw<
    { status: string; claimToken: string | null }[]
  >`SELECT "status"::text AS "status", "claimToken" FROM "RetentionRun"
    WHERE "id" = ${claim.id} FOR UPDATE`;
  if (!row || row.status !== 'RUNNING' || row.claimToken !== claim.token)
    throw new Fenced();
  await tx.retentionRun.update({
    where: { id: claim.id },
    data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
  });
}

/** One fenced, bounded step of destructive work (gate first, always). */
const step = <T>(actor: Actor, claim: Claim, work: (tx: Tx) => Promise<T>) =>
  prisma.$transaction(
    async (tx) => {
      await lockRetentionGate(tx, 'cleanup');
      await fence(tx, actor, claim);
      return work(tx);
    },
    { timeout: 30_000 },
  );

/** Starts this press's run, or resumes it; a finished one is returned. */
async function claimRun(actor: Actor, requestKey: string, requestId?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RETENTION_LOCK}::bigint)`;
    await recheckStaff(tx, actor, true);
    const mine = await tx.retentionRun.findUnique({
      where: {
        requestedById_requestKey: { requestedById: actor.id, requestKey },
      },
    });
    if (mine?.status === 'DONE') return { finished: true as const, run: mine };
    const at = new Date();
    if (
      await tx.retentionRun.findFirst({
        where: { status: 'RUNNING', leaseUntil: { gt: at } },
      })
    )
      throw running();
    // Runs whose lease ran out lose their claim now: their old attempt
    // stops at its next step. Their counts stay as they were.
    await tx.retentionRun.updateMany({
      where: {
        status: 'RUNNING',
        leaseUntil: { lte: at },
        ...(mine && { id: { not: mine.id } }),
      },
      data: {
        status: 'FAILED',
        claimToken: null,
        finishedAt: at,
        failure: 'abandoned',
      },
    });
    const token = randomUUID();
    const leaseUntil = new Date(at.getTime() + LEASE_MS);
    const run = mine
      ? await tx.retentionRun.update({
          where: { id: mine.id },
          data: {
            status: 'RUNNING',
            claimToken: token,
            attempts: { increment: 1 },
            leaseUntil,
            finishedAt: null,
            failure: null,
          },
        })
      : await tx.retentionRun.create({
          data: {
            requestedById: actor.id,
            requestKey,
            claimToken: token,
            leaseUntil,
          },
        });
    await recordAudit(tx, {
      actorId: actor.id,
      action: mine ? 'retention.run_resumed' : 'retention.run_started',
      entityType: 'RetentionRun',
      entityId: run.id,
      requestId,
      metadata: { attempt: run.attempts },
    });
    return {
      finished: false as const,
      run,
      claim: { id: run.id, token },
    };
  });
}

/**
 * Removes what is due now (never held records) as one durable job per
 * request key; returns its summary. Errors are reported, never turned into
 * success: the run is marked failed (if this attempt still owns it) with
 * exactly what it removed, and a retry with the same key resumes it.
 */
export async function runRetention(
  actor: Actor,
  requestKey: string,
  requestId?: string,
  now = new Date(),
): Promise<RetentionRunSummary> {
  requireDeletionAllowed();
  const claimed = await claimRun(actor, requestKey, requestId);
  if (claimed.finished) return toRunSummary(claimed.run);
  const { claim } = claimed;
  let stage: RetentionRunStage = claimed.run.stage;
  /** Saves the next stage (fenced); returns it. */
  const advance = async (next: RetentionRunStage) => {
    await step(actor, claim, (tx) =>
      tx.retentionRun.update({
        where: { id: claim.id },
        data: { stage: next },
      }),
    );
    return next;
  };
  const skip: string[] = [];
  try {
    if (stage === 'ACCOUNTS') {
      for (let tried = 0; tried < ACCOUNT_BATCH; tried++) {
        await retentionPause('run.step');
        const next = await step(actor, claim, async (tx) => {
          const purged = await purgeNextDue(tx, now, skip);
          if (purged?.done)
            await tx.retentionRun.update({
              where: { id: claim.id },
              data: { removedAccounts: { increment: 1 } },
            });
          return purged;
        });
        if (!next) break;
        if (!next.done) skip.push(next.id);
      }
      stage = await advance('AUDIT');
    }
    const trims = [
      {
        from: 'AUDIT',
        to: 'DELETIONS',
        trim: trimAuditBatch,
        count: (n: number) => ({ removedAuditEvents: { increment: n } }),
      },
      {
        from: 'DELETIONS',
        to: 'FINISHED',
        trim: trimDeletionBatch,
        count: (n: number) => ({ removedDeletionRecords: { increment: n } }),
      },
    ] as const;
    for (const { from, to, trim, count: counted } of trims) {
      if (stage !== from) continue;
      for (let batch = 0; batch < AUDIT_BATCHES; batch++) {
        await retentionPause('run.step');
        const count = await step(actor, claim, async (tx) => {
          const removed = await trim(tx, now, AUDIT_BATCH);
          if (removed)
            await tx.retentionRun.update({
              where: { id: claim.id },
              data: counted(removed),
            });
          return removed;
        });
        if (count < AUDIT_BATCH) break;
      }
      stage = await advance(to);
    }
    await retentionPause('run.finish');
    const done = await step(actor, claim, async (tx) => {
      const accounts = await countDueAccounts(tx, now, skip);
      const audit = await countDueAudit(tx, now);
      const result: Result = {
        held: {
          deletedAccounts: accounts.held,
          auditEvents: audit.heldEvents,
        },
        more: accounts.due + audit.events + audit.deletions > 0,
      };
      const saved = await tx.retentionRun.update({
        where: { id: claim.id },
        data: {
          status: 'DONE',
          stage: 'FINISHED',
          claimToken: null,
          finishedAt: new Date(),
          result: result as never,
        },
      });
      const summary = toRunSummary(saved);
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'retention.run_finished',
        entityType: 'RetentionRun',
        entityId: claim.id,
        requestId,
        metadata: { removed: summary.removed, ...result },
      });
      return summary;
    });
    return done;
  } catch (error) {
    if (error instanceof Fenced) throw takenOver();
    await markFailed(claim, actor, error, requestId);
    throw error;
  }
}

/** Marks the run failed, only if this attempt still owns it; counts stay. */
async function markFailed(
  claim: Claim,
  actor: Actor,
  error: unknown,
  requestId?: string,
) {
  const failure = error instanceof AppError ? error.code : 'error';
  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.retentionRun.updateMany({
        where: { id: claim.id, claimToken: claim.token, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          claimToken: null,
          finishedAt: new Date(),
          failure,
        },
      });
      if (!changed.count) return;
      const run = await tx.retentionRun.findUniqueOrThrow({
        where: { id: claim.id },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'retention.run_failed',
        entityType: 'RetentionRun',
        entityId: claim.id,
        requestId,
        metadata: { failure, removed: toRunSummary(run).removed },
      });
    });
  } catch {
    // Recording the failure failed too (database gone). The original error
    // is still the answer; the lease runs out and the run can be resumed.
  }
}

/** Active holds, newest first, with whose records they keep. */
export async function listHolds(
  now = new Date(),
): Promise<RetentionHoldItem[]> {
  const holds = await prisma.retentionHold.findMany({
    where: { releasedAt: null },
    orderBy: { placedAt: 'desc' },
  });
  const people = await prisma.user.findMany({
    where: {
      id: { in: Array.from(new Set<string>(holds.map((hold) => hold.userId))) },
    },
    select: { id: true, name: true, email: true, status: true },
  });
  return holds.map((hold) => toHoldItem(hold, people, now));
}

export function toHoldItem(
  hold: {
    id: string;
    userId: string;
    reason: string;
    reference: string;
    basis: string;
    reviewBy: Date;
    placedAt: Date;
    version: number;
  },
  people: { id: string; name: string | null; email: string; status: string }[],
  now = new Date(),
): RetentionHoldItem {
  const person = people.find((item) => item.id === hold.userId);
  const reviewBy = nzNow(hold.reviewBy).date;
  return {
    id: hold.id,
    userId: hold.userId,
    subject: person ? personName(person) : 'Removed account',
    reason: hold.reason.toLowerCase() as RetentionHoldItem['reason'],
    reference: hold.reference,
    basis: hold.basis,
    reviewBy,
    overdue: nzNow(now).date > reviewBy,
    placedAt: hold.placedAt.toISOString(),
    version: hold.version,
  };
}
