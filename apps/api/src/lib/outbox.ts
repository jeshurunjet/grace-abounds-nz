import { createHmac } from 'node:crypto';
import { prisma } from '@grace-abounds/database';
import { CONTENT_CHANGED } from './content-change.js';
import { STORAGE_REMOVE, storageRemover } from './assets.js';
import { CALENDAR_SYNC } from './calendar-queue.js';
import { calendarSyncRequester } from './calendar-sync.js';
import { EMAIL_DELIVER, emailDeliverer } from './email-delivery.js';
import { ACCOUNT_NOTICE, deletionNoticeSender } from './account-deletion.js';

/*
 * Outbox dispatcher (Phase 2C). Events are written in the same transaction
 * as the change; this delivers them afterwards, in id order, at least once.
 * A failed delivery is retried with backoff and keeps its error; nothing is
 * lost if the API restarts. Several API processes can drain safely: rows are
 * claimed with FOR UPDATE SKIP LOCKED.
 */

export type OutboxEventRow = {
  id: number;
  topic: string;
  payload: unknown;
  attempts: number;
};
/** Delivers a batch of events of one topic; throws to retry them all. */
export type OutboxHandler = (events: OutboxEventRow[]) => Promise<void>;

const MAX_BACKOFF_SECONDS = 300;

type Log = { warn: (object: object, message: string) => void };

export async function drainOutbox(
  handlers: Record<string, OutboxHandler>,
  batch = 50,
  log?: Log,
): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<OutboxEventRow[]>`
        SELECT id, topic, payload, attempts FROM "OutboxEvent"
        WHERE "processedAt" IS NULL AND "availableAt" <= now()
        ORDER BY id
        LIMIT ${batch}
        FOR UPDATE SKIP LOCKED`;
      const byTopic = new Map<string, OutboxEventRow[]>();
      for (const row of rows)
        byTopic.set(row.topic, [...(byTopic.get(row.topic) ?? []), row]);
      for (const [topic, events] of byTopic) {
        const ids = events.map((event) => event.id);
        try {
          // An event nobody handles is kept and retried, never acknowledged:
          // registering its handler later still delivers it.
          const handler = handlers[topic];
          if (!handler)
            throw new Error(`No handler for outbox topic "${topic}".`);
          await handler(events);
          await tx.outboxEvent.updateMany({
            where: { id: { in: ids } },
            data: {
              processedAt: new Date(),
              attempts: { increment: 1 },
              lastError: null,
            },
          });
        } catch (error) {
          // Only the topic, ids and message are logged; never payloads.
          log?.warn(
            { topic, ids, error: String((error as Error)?.message ?? error) },
            'Outbox delivery failed; it will be retried.',
          );
          for (const event of events) {
            const delay = Math.min(
              2 ** (event.attempts + 1),
              MAX_BACKOFF_SECONDS,
            );
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: {
                attempts: { increment: 1 },
                availableAt: new Date(Date.now() + delay * 1000),
                lastError: String((error as Error)?.message ?? error).slice(
                  0,
                  500,
                ),
              },
            });
          }
        }
      }
      return rows.length;
    },
    { timeout: 30_000 },
  );
}

/**
 * Asks the website to drop its cached public content (Next.js tag
 * "public-content"). Signed with the API/web shared secret; the website
 * refuses unsigned or stale requests. With public caching off (the default)
 * this is a harmless no-op on the website side.
 */
export function contentRevalidator(
  webUrl = process.env.WEB_INTERNAL_URL ?? 'http://localhost:3000',
  secret = process.env.API_ASSERTION_SECRET ?? '',
  send: typeof fetch = fetch,
): OutboxHandler {
  return async (events) => {
    if (!events.length) return;
    const at = Date.now();
    const tags = 'public-content';
    const signature = createHmac('sha256', secret)
      .update(`${at}.${tags}`)
      .digest('hex');
    const response = await send(`${webUrl}/api/internal/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ at, tags, signature }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok)
      throw new Error(`Website revalidation failed (${response.status}).`);
  };
}

/** Runs the dispatcher every few seconds in the API process. */
export function startOutboxDispatcher(log: Log, everyMs = 3_000) {
  const handlers = {
    [CONTENT_CHANGED]: contentRevalidator(),
    // Removes stored files after their records are deleted (Phase 2D).
    [STORAGE_REMOVE]: storageRemover(),
    // Marks activities for the Google Calendar worker (Phase 3C).
    [CALENDAR_SYNC]: calendarSyncRequester(),
    // Optional update emails chosen in Settings (Phase 5A).
    [EMAIL_DELIVER]: emailDeliverer(),
    // The mandatory notice after an account deletion (Phase 5C).
    [ACCOUNT_NOTICE]: deletionNoticeSender(),
  };
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    drainOutbox(handlers, 50, log)
      .catch((error) => log.warn({ err: error }, 'Outbox dispatch failed.'))
      .finally(() => {
        running = false;
      });
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
