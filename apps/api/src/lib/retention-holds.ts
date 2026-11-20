import type { Prisma, prisma as client } from '@grace-abounds/database';

/*
 * Records holds (Phase 5C): the people whose records every retention
 * clean-up must leave alone while a hold is active (not released). A hold
 * keeps protecting after its review date (that is shown as overdue to
 * staff) until someone releases it, so nothing a legal obligation needs is
 * removed just because a review was missed. There is no automatic expiry.
 *
 * Serialization (the retention gate): every transaction that deletes
 * records by age or eligibility (care retention, the deleted-account
 * purge, the audit trim and "Delete eligible records now") takes the gate
 * in shared mode FIRST and only then reads which people are held; placing,
 * renewing and releasing a hold takes it in exclusive mode first. So a
 * hold either commits before a clean-up transaction reads the holds (and
 * is honoured) or waits until that transaction has finished; a hold can
 * never land between a clean-up's check and its delete.
 *
 * Lock order everywhere: retention gate, then Pastor set, then user
 * security locks (the acting user's before anyone else's), then rows.
 */

type Client = Prisma.TransactionClient | typeof client;

const RETENTION_GATE = 7_204_202;

/** First in the transaction: 'cleanup' (shared) or 'holds' (exclusive). */
export async function lockRetentionGate(
  tx: Prisma.TransactionClient,
  mode: 'cleanup' | 'holds',
) {
  if (mode === 'cleanup')
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${RETENTION_GATE}::bigint)`;
  else
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RETENTION_GATE}::bigint)`;
}

/** Ids of people under an active hold (optionally: just this one). */
export async function heldUserIds(db: Client, userId?: string) {
  const rows = await db.retentionHold.findMany({
    where: { releasedAt: null, ...(userId && { userId }) },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((row) => row.userId);
}

/**
 * Activity entries a hold keeps: made by a held person, or canonically
 * about one (their account, or their prayers, appointments, bookings,
 * exports or sessions, including staff entries about those records).
 */
export const heldAudit = (held: string[]): Prisma.AuditEventWhereInput => ({
  OR: [
    { actorId: { in: held } },
    { subjectId: { in: held } },
    { entityId: { in: held } },
  ],
});

/**
 * The exact complement of heldAudit. Null-safe: in SQL, `actorId NOT IN
 * (...)` is unknown (so never true) when actorId is null, which would keep
 * every entry without an actor or subject; an explicit IS NULL branch
 * makes such entries eligible like any other.
 */
export const unheldAudit = (held: string[]): Prisma.AuditEventWhereInput => ({
  AND: [
    { OR: [{ actorId: null }, { actorId: { notIn: held } }] },
    { OR: [{ subjectId: null }, { subjectId: { notIn: held } }] },
    { entityId: { notIn: held } },
  ],
});

type Pause = (point: string) => Promise<void>;
let pauseHook: Pause | null = null;
/** Tests only: pause clean-up at named points to force an interleaving. */
export function setRetentionPauseForTests(hook: Pause | null) {
  if (!process.env.VITEST)
    throw new Error('Retention pauses can only be set in tests.');
  pauseHook = hook;
}
/** A no-op outside tests. */
export async function retentionPause(point: string) {
  if (pauseHook) await pauseHook(point);
}
