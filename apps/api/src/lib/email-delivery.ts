import { prisma, Prisma } from '@grace-abounds/database';
import { emailCategoryFor, isSafeAppPath } from '@grace-abounds/validation';
import type { OutboxHandler } from './outbox.js';
import { emailSender, type SendEmail } from './email.js';

/*
 * Optional update emails (Phase 5A). When a notification is written, an
 * email copy is queued in the same transaction for each recipient who chose
 * that category (prayer/appointment updates, or account updates). The
 * outbox then sends it after commit, retrying with backoff.
 *
 * Exactly one email per notification and recipient: the delivery row's
 * dedupe key is unique (a replayed transition queues nothing new), a send
 * first claims the row (QUEUED -> SENDING, conditional, with a lease for
 * crash recovery), and the provider idempotency key is the delivery id, so
 * even a retry after an unacknowledged send is accepted once. Before
 * sending it re-checks that the notification still exists, the account is
 * active and the preference is still on; otherwise it is skipped.
 *
 * Email text is the notification's own generic title and body plus a link:
 * never prayer text, appointment reasons or notes. Security emails are not
 * sent from here and never depend on these preferences.
 */

type Tx = Prisma.TransactionClient;

/** Outbox topic: send queued update emails. */
export const EMAIL_DELIVER = 'email.deliver';
/** Give up (FAILED) after this many provider attempts. */
export const EMAIL_MAX_ATTEMPTS = 6;
const CLAIM_MS = 2 * 60_000;
const DONE: string[] = ['SENT', 'SKIPPED', 'FAILED'];

/** Queues email copies for recipients who chose this kind's category. */
export async function queueEmails(
  tx: Tx,
  input: { userIds: string[]; kind: string; dedupe: string },
) {
  const category = emailCategoryFor(input.kind);
  if (!category || !input.userIds.length) return;
  const wanted = await tx.notificationPreference.findMany({
    where: {
      userId: { in: input.userIds },
      ...(category === 'care' ? { emailCare: true } : { emailAccount: true }),
      user: { status: 'ACTIVE' },
    },
    select: { userId: true },
  });
  if (!wanted.length) return;
  const keys = wanted.map((row) => `${input.dedupe}:${row.userId}`);
  await tx.emailDelivery.createMany({
    data: wanted.map((row, index) => ({
      dedupeKey: keys[index]!,
      userId: row.userId,
      category,
    })),
    skipDuplicates: true,
  });
  await tx.outboxEvent.create({
    data: { topic: EMAIL_DELIVER, payload: { keys } },
  });
}

const siteUrl = (env = process.env) =>
  (env.AUTH_URL || env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );

/** The email for one notification: its generic text and a link. */
export function updateEmail(
  notification: { title: string; body: string; href: string },
  category: string,
  base = siteUrl(),
) {
  const link =
    base && isSafeAppPath(notification.href)
      ? `${base}${notification.href}`
      : base;
  const settings = base ? `${base}/settings` : '';
  const why =
    category === 'care'
      ? 'You get these emails because you turned on prayer and appointment update emails.'
      : 'You get these emails because you turned on account update emails.';
  const lines = [
    notification.title,
    notification.body,
    link
      ? `Open Grace Abounds to see it: ${link}`
      : 'Open Grace Abounds to see it.',
    '',
    `${why} You can turn them off in Settings${settings ? `: ${settings}` : '.'}`,
  ].filter((line, index) => line || index === 3);
  return {
    subject: notification.title,
    text: lines.join('\n'),
    html: [
      `<p><strong>${escapeHtml(notification.title)}</strong></p>`,
      notification.body ? `<p>${escapeHtml(notification.body)}</p>` : '',
      link
        ? `<p><a href="${escapeHtml(link)}">Open Grace Abounds to see it</a></p>`
        : '<p>Open Grace Abounds to see it.</p>',
      `<p style="color:#596067;font-size:13px">${escapeHtml(why)} You can turn them off in ${
        settings ? `<a href="${escapeHtml(settings)}">Settings</a>` : 'Settings'
      }.</p>`,
    ].join(''),
  };
}

/** Sends one queued email if it is still due; returns what happened. */
export async function deliverEmail(
  key: string,
  send: SendEmail,
  now = new Date(),
): Promise<'sent' | 'skipped' | 'busy' | 'failed'> {
  const delivery = await prisma.emailDelivery.findUnique({
    where: { dedupeKey: key },
  });
  if (!delivery || DONE.includes(delivery.status)) return 'skipped';
  // Claim it: only one sender at a time, and never after it was sent.
  const claimed = await prisma.emailDelivery.updateMany({
    where: {
      id: delivery.id,
      OR: [
        { status: 'QUEUED' },
        { status: 'SENDING', claimedUntil: { lt: now } },
      ],
    },
    data: {
      status: 'SENDING',
      claimedUntil: new Date(now.getTime() + CLAIM_MS),
    },
  });
  if (claimed.count === 0) {
    const latest = await prisma.emailDelivery.findUnique({
      where: { id: delivery.id },
      select: { status: true },
    });
    return !latest || DONE.includes(latest.status) ? 'skipped' : 'busy';
  }
  const notification = await prisma.notification.findUnique({
    where: { dedupeKey: key },
    select: {
      title: true,
      body: true,
      href: true,
      user: {
        select: {
          email: true,
          status: true,
          notificationPreference: true,
        },
      },
    },
  });
  const preference = notification?.user.notificationPreference;
  const stillWanted =
    !!notification &&
    notification.user.status === 'ACTIVE' &&
    !!preference &&
    (delivery.category === 'care'
      ? preference.emailCare
      : preference.emailAccount);
  if (!stillWanted) {
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: 'SKIPPED', claimedUntil: null },
    });
    return 'skipped';
  }
  try {
    const providerId = await send({
      to: notification.user.email,
      ...updateEmail(notification, delivery.category),
      idempotencyKey: delivery.id,
    });
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        providerId,
        attempts: { increment: 1 },
        claimedUntil: null,
        lastError: '',
      },
    });
    return 'sent';
  } catch (error) {
    const attempts = delivery.attempts + 1;
    const giveUp = attempts >= EMAIL_MAX_ATTEMPTS;
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: giveUp ? 'FAILED' : 'QUEUED',
        attempts,
        claimedUntil: null,
        lastError: String((error as Error)?.message ?? error).slice(0, 300),
      },
    });
    if (giveUp) return 'failed';
    throw error;
  }
}

/** Outbox handler: sends queued update emails; throws to retry later. */
export function emailDeliverer(send: SendEmail = emailSender()): OutboxHandler {
  return async (events) => {
    let failure: unknown = null;
    for (const event of events) {
      const keys = (event.payload as { keys?: unknown } | null)?.keys;
      if (!Array.isArray(keys)) continue;
      for (const key of keys) {
        if (typeof key !== 'string') continue;
        try {
          const result = await deliverEmail(key, send);
          // Another sender holds it: retry this event later.
          if (result === 'busy') failure ??= new Error('Email is being sent.');
        } catch (error) {
          failure ??= error;
        }
      }
    }
    if (failure) throw failure;
  };
}

/** Removes delivery records with their notifications (care retention). */
export function forgetDeliveries(tx: Tx, dedupeKeys: string[]) {
  if (!dedupeKeys.length) return Promise.resolve({ count: 0 });
  return tx.emailDelivery.deleteMany({
    where: { dedupeKey: { in: dedupeKeys } },
  });
}
