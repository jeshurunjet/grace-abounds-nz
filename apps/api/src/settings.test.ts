// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { SignJWT } from 'jose';
import { prisma } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';
import { buildApp } from './app.js';
import { setStorage } from './lib/storage.js';
import { MemoryStorage } from './lib/storage-memory.js';
import {
  deliverEmail,
  EMAIL_DELIVER,
  EMAIL_MAX_ATTEMPTS,
  emailDeliverer,
} from './lib/email-delivery.js';
import type { EmailMessage } from './lib/email.js';
import {
  EXPORT_MAX_ATTEMPTS,
  expireExports,
  FILE_SWEEP_GRACE_MS,
  processExports,
  sweepExportFiles,
} from './lib/data-export.js';
import { STORAGE_REMOVE, storageRemover } from './lib/assets.js';
import { expirePrayers } from './lib/care-retention.js';

/*
 * Phase 5A/5B. Notification preferences are own-account, versioned and
 * saved explicitly; they choose optional update emails only. Emails are
 * queued with their notification, sent once per notification and recipient
 * (retries and replays never send twice), carry only generic text, and are
 * skipped when no longer wanted. Data exports are own-account background
 * jobs: recent sign-in to request and to get a short-lived download link,
 * retry-safe builds, an explicit allowlist of the owner's data, expiry with
 * file removal, and nothing for anyone else.
 */

const SECRET_PRAYER = 'Please pray about my diagnosis';
const PASTOR_NOTE = 'Pastor-only follow-up note';
const DAY = 86_400_000;

describe.skipIf(!dbTestsEnabled)(
  'account settings and export (PostgreSQL)',
  () => {
    const app = buildApp();
    let storage: MemoryStorage;
    beforeAll(() => app.ready());
    beforeEach(async () => {
      await resetIdentityTables();
      storage = new MemoryStorage();
      setStorage(storage);
      process.env.AUTH_URL = 'https://church.example';
    });
    afterEach(() => setStorage(undefined));
    afterAll(async () => {
      await app.close();
      await prisma.$disconnect();
    });

    async function headersFor(userId: string, authenticatedAt?: Date) {
      const session = await createSession(userId, { authenticatedAt });
      const token = await new SignJWT({
        sid: session.id,
        sv: session.sessionVersion,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer('grace-web')
        .setAudience('grace-api')
        .setIssuedAt()
        .setExpirationTime('60s')
        .sign(new TextEncoder().encode(process.env.API_ASSERTION_SECRET!));
      return { authorization: `Bearer ${token}` };
    }
    async function as(
      role: 'MEMBER' | 'ADMIN' | 'PASTOR' = 'MEMBER',
      authenticatedAt?: Date,
    ) {
      const user = await createUser({ role });
      return { user, headers: await headersFor(user.id, authenticatedAt) };
    }
    type Who = Awaited<ReturnType<typeof as>>;
    const call = (
      method: string,
      url: string,
      who?: Who,
      body?: unknown,
      version?: number,
    ) =>
      app.inject({
        method: method as never,
        url,
        headers: {
          ...who?.headers,
          ...(version !== undefined && { 'if-match': `"${version}"` }),
        },
        ...(body !== undefined && { payload: body as never }),
      });
    const savePrefs = (who: Who, body: unknown, version?: number) =>
      call('PUT', '/v1/me/preferences', who, body, version);
    /** A member's prayer moved to Praying: one care notification for them. */
    async function prayerUpdate(member: Who, pastor: Who, key = 'key-00001') {
      const id = (
        await call('POST', '/v1/member/prayers', member, {
          text: SECRET_PRAYER,
          clientKey: key,
        })
      ).json().data.id as string;
      await call(
        'POST',
        `/v1/pastor/prayers/${id}/status`,
        pastor,
        { status: 'praying' },
        1,
      );
      return id;
    }
    function recorder(fail = 0) {
      const sent: EmailMessage[] = [];
      let failures = fail;
      const send = async (message: EmailMessage) => {
        if (failures-- > 0) throw new Error('provider unavailable');
        sent.push(message);
        return `provider-${sent.length}`;
      };
      return { sent, send };
    }
    const emailEvents = () =>
      prisma.outboxEvent.findMany({ where: { topic: EMAIL_DELIVER } });

    describe('notification preferences (5A)', () => {
      it('are own-account, start off, and save explicitly with the version shown', async () => {
        const anna = await as();
        const ben = await as();
        expect((await call('GET', '/v1/me/preferences')).statusCode).toBe(401);
        const first = await call('GET', '/v1/me/preferences', anna);
        expect(first.json().data).toEqual({
          emailCare: false,
          emailAccount: false,
          version: 1,
        });
        expect(first.headers['cache-control']).toContain('no-store');

        expect(
          (await savePrefs(anna, { emailCare: true, emailAccount: false }))
            .statusCode,
        ).toBe(428);
        expect(
          (await savePrefs(anna, { emailCare: 'yes', emailAccount: false }, 1))
            .statusCode,
        ).toBe(422);
        expect(
          (await savePrefs(anna, { emailCare: true, push: true }, 1))
            .statusCode,
        ).toBe(422);
        const saved = await savePrefs(
          anna,
          { emailCare: true, emailAccount: false },
          1,
        );
        expect(saved.json().data).toEqual({
          emailCare: true,
          emailAccount: false,
          version: 2,
        });
        // A stale save (another device) is refused, not applied.
        const stale = await savePrefs(
          anna,
          { emailCare: false, emailAccount: true },
          1,
        );
        expect(stale.statusCode).toBe(412);
        expect(
          (await call('GET', '/v1/me/preferences', anna)).json().data,
        ).toMatchObject({ emailCare: true, version: 2 });
        // Another person's choices are untouched.
        expect(
          (await call('GET', '/v1/me/preferences', ben)).json().data,
        ).toMatchObject({ emailCare: false, version: 1 });
        const audit = await prisma.auditEvent.findFirst({
          where: { action: 'account.preferences_saved' },
        });
        expect(audit?.actorId).toBe(anna.user.id);
      });

      it('two first saves at once: exactly one applies', async () => {
        const anna = await as();
        const [a, b] = await Promise.all([
          savePrefs(anna, { emailCare: true, emailAccount: false }, 1),
          savePrefs(anna, { emailCare: false, emailAccount: true }, 1),
        ]);
        expect([a.statusCode, b.statusCode].sort()).toEqual([200, 412]);
        expect(
          (
            await prisma.notificationPreference.findUniqueOrThrow({
              where: { userId: anna.user.id },
            })
          ).version,
        ).toBe(2);
      });
    });

    describe('optional update emails (5A)', () => {
      it('nothing is queued unless chosen; in-app notifications are always kept', async () => {
        const [anna, pastor] = [await as(), await as('PASTOR')];
        await prayerUpdate(anna, pastor);
        expect(
          await prisma.notification.count({ where: { userId: anna.user.id } }),
        ).toBe(1);
        expect(await prisma.emailDelivery.count()).toBe(0);
        expect(await emailEvents()).toHaveLength(0);
      });

      it('sends one generic email per notification, even when retried or replayed', async () => {
        const [anna, pastor] = [await as(), await as('PASTOR')];
        await savePrefs(anna, { emailCare: true, emailAccount: false }, 1);
        await prayerUpdate(anna, pastor);
        const [delivery] = await prisma.emailDelivery.findMany();
        expect(delivery).toMatchObject({
          userId: anna.user.id,
          category: 'care',
          status: 'QUEUED',
        });
        const events = await emailEvents();
        expect(events).toHaveLength(1);

        // The provider fails once: retried later, same idempotency key.
        const { sent, send } = recorder(1);
        const handler = emailDeliverer(send);
        const asEvents = events.map((event) => ({
          id: event.id,
          topic: event.topic,
          payload: event.payload,
          attempts: event.attempts,
        }));
        await expect(handler(asEvents)).rejects.toThrow('provider unavailable');
        expect(
          await prisma.emailDelivery.findUniqueOrThrow({
            where: { id: delivery!.id },
          }),
        ).toMatchObject({ status: 'QUEUED', attempts: 1 });
        await handler(asEvents);
        // A replayed event (or a second dispatcher) sends nothing more.
        await handler(asEvents);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
          to: anna.user.email,
          idempotencyKey: delivery!.id,
        });
        expect(sent[0]!.text).toContain(
          'https://church.example/members/prayer?request=',
        );
        for (const part of [sent[0]!.subject, sent[0]!.text, sent[0]!.html])
          expect(part).not.toContain(SECRET_PRAYER);
        expect(
          await prisma.emailDelivery.findUniqueOrThrow({
            where: { id: delivery!.id },
          }),
        ).toMatchObject({ status: 'SENT', providerId: 'provider-1' });
      });

      it('two senders at once: only one sends', async () => {
        const [anna, pastor] = [await as(), await as('PASTOR')];
        await savePrefs(anna, { emailCare: true, emailAccount: false }, 1);
        await prayerUpdate(anna, pastor);
        const { dedupeKey } = await prisma.emailDelivery.findFirstOrThrow();
        let calls = 0;
        const slow = async () => {
          calls++;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return 'provider-x';
        };
        const results = await Promise.all([
          deliverEmail(dedupeKey, slow),
          deliverEmail(dedupeKey, slow),
        ]);
        expect(calls).toBe(1);
        expect(results.sort()).toEqual(['busy', 'sent']);
      });

      it('skips an email no longer wanted: choice turned off or account suspended', async () => {
        const [anna, ben, pastor] = [
          await as(),
          await as(),
          await as('PASTOR'),
        ];
        for (const who of [anna, ben])
          await savePrefs(who, { emailCare: true, emailAccount: false }, 1);
        await prayerUpdate(anna, pastor, 'key-anna1');
        await prayerUpdate(ben, pastor, 'key-ben001');
        await savePrefs(anna, { emailCare: false, emailAccount: false }, 2);
        await prisma.user.update({
          where: { id: ben.user.id },
          data: { status: 'SUSPENDED' },
        });
        const { sent, send } = recorder();
        for (const row of await prisma.emailDelivery.findMany())
          expect(await deliverEmail(row.dedupeKey, send)).toBe('skipped');
        expect(sent).toHaveLength(0);
        expect(
          await prisma.emailDelivery.count({ where: { status: 'SKIPPED' } }),
        ).toBe(2);
      });

      it('gives up after repeated provider failures, without retrying forever', async () => {
        const [anna, pastor] = [await as(), await as('PASTOR')];
        await savePrefs(anna, { emailCare: true, emailAccount: false }, 1);
        await prayerUpdate(anna, pastor);
        const { dedupeKey } = await prisma.emailDelivery.findFirstOrThrow();
        const failing = async () => {
          throw new Error('provider unavailable');
        };
        for (let attempt = 1; attempt < EMAIL_MAX_ATTEMPTS; attempt++)
          await expect(deliverEmail(dedupeKey, failing)).rejects.toThrow();
        expect(await deliverEmail(dedupeKey, failing)).toBe('failed');
        expect(await prisma.emailDelivery.findFirstOrThrow()).toMatchObject({
          status: 'FAILED',
          attempts: EMAIL_MAX_ATTEMPTS,
        });
      });

      it('delivery records leave with their notification (care retention)', async () => {
        const [anna, pastor] = [await as(), await as('PASTOR')];
        await savePrefs(anna, { emailCare: true, emailAccount: false }, 1);
        const id = await prayerUpdate(anna, pastor);
        await call(
          'POST',
          `/v1/pastor/prayers/${id}/status`,
          pastor,
          { status: 'prayed_for' },
          2,
        );
        expect(await prisma.emailDelivery.count()).toBe(2);
        await prisma.prayerRequest.update({
          where: { id },
          data: { closedAt: new Date(Date.now() - 400 * DAY) },
        });
        expect(await expirePrayers(new Date())).toBe(1);
        expect(await prisma.emailDelivery.count()).toBe(0);
      });
    });

    describe('personal data export (5B)', () => {
      const request = (who: Who) => call('POST', '/v1/me/exports', who);
      const download = (who: Who, id: string) =>
        call('POST', `/v1/me/exports/${id}/download`, who);
      const build = (now?: Date) =>
        processExports({ storage, ...(now && { now: () => now }) });

      it('needs a recent sign-in and file storage; asking again returns the same export', async () => {
        const stale = await as('MEMBER', new Date(Date.now() - 60 * 60_000));
        const refused = await request(stale);
        expect(refused.statusCode).toBe(403);
        expect(refused.json().error.code).toBe('REAUTH_REQUIRED');
        expect(await prisma.dataExport.count()).toBe(0);

        const anna = await as();
        setStorage(null);
        expect((await request(anna)).statusCode).toBe(503);
        setStorage(storage);

        const first = await request(anna);
        expect(first.statusCode).toBe(202);
        expect(first.json().data).toMatchObject({ status: 'queued' });
        expect(first.headers['cache-control']).toContain('no-store');
        const again = await request(anna);
        expect(again.statusCode).toBe(200);
        expect(again.json().data.id).toBe(first.json().data.id);
        expect(await prisma.dataExport.count()).toBe(1);
        // Someone else sees none of it.
        const ben = await as();
        expect((await call('GET', '/v1/me/exports', ben)).json().data).toEqual(
          [],
        );
      });

      it('contains the owner’s own data only, never credentials, others or Pastor-only notes', async () => {
        const [anna, ben, pastor] = [
          await as(),
          await as(),
          await as('PASTOR'),
        ];
        await prisma.user.update({
          where: { id: anna.user.id },
          data: { name: 'Anna Owner', passwordHash: 'argon2-secret-hash' },
        });
        await prisma.user.update({
          where: { id: ben.user.id },
          data: { name: 'Ben Other' },
        });
        const prayerId = await prayerUpdate(anna, pastor);
        await prisma.prayerNote.create({
          data: { prayerId, text: PASTOR_NOTE, authorId: pastor.user.id },
        });
        const appointment = await prisma.appointment.create({
          data: {
            userId: anna.user.id,
            topic: 'Prayer',
            reason: 'My own appointment message',
            clientKey: 'appt-1',
            events: { create: { status: 'REQUESTED' } },
          },
        });
        await prisma.appointmentNote.create({
          data: {
            appointmentId: appointment.id,
            text: PASTOR_NOTE,
            authorId: pastor.user.id,
          },
        });
        const activity = await prisma.activity.create({
          data: {
            slug: 'sunday',
            kind: 'service',
            title: 'Sunday Service',
            repeat: 'weekly',
            startDate: new Date('2026-11-01'),
            days: [0],
          },
        });
        await prisma.participation.create({
          data: {
            activityId: activity.id,
            userId: anna.user.id,
            dateKey: '2026-11-29',
            events: { create: { action: 'booked', actorId: anna.user.id } },
          },
        });
        await prisma.participation.create({
          data: { activityId: activity.id, userId: ben.user.id },
        });

        const id = (await request(anna)).json().data.id as string;
        expect(await build()).toBe(1);
        const row = await prisma.dataExport.findUniqueOrThrow({
          where: { id },
        });
        expect(row).toMatchObject({
          status: 'READY',
          // One file per build attempt.
          storageKey: expect.stringMatching(
            new RegExp(`^exports/${anna.user.id}/${id}/[\\w-]+\\.json$`),
          ),
        });
        expect(row.expiresAt!.getTime() - row.readyAt!.getTime()).toBe(7 * DAY);
        const file = storage.objects.get(row.storageKey!)!;
        expect(file.contentType).toBe('application/json');
        const text = new TextDecoder().decode(file.bytes);
        const data = JSON.parse(text);
        expect(data.account).toMatchObject({
          email: anna.user.email,
          name: 'Anna Owner',
        });
        expect(data.signInMethods.password).toBe(true);
        expect(data.prayerRequests[0]).toMatchObject({
          text: SECRET_PRAYER,
          status: 'praying',
        });
        expect(data.appointments[0]).toMatchObject({
          message: 'My own appointment message',
        });
        expect(data.bookings).toEqual([
          expect.objectContaining({
            activity: 'Sunday Service',
            date: '2026-11-29',
            history: [expect.objectContaining({ action: 'booked', by: 'you' })],
          }),
        ]);
        for (const secret of [
          PASTOR_NOTE,
          'argon2-secret-hash',
          'sessionVersion',
          'passwordHash',
          ben.user.email,
          'Ben Other',
          pastor.user.id,
          pastor.user.email,
        ])
          expect(text).not.toContain(secret);
      });

      it('tells the owner once when ready; a repeated build changes nothing', async () => {
        const anna = await as();
        await savePrefs(anna, { emailCare: false, emailAccount: true }, 1);
        const id = (await request(anna)).json().data.id;
        await build();
        await build();
        expect(
          await prisma.notification.findMany({
            where: { entityType: 'data_export' },
            select: { userId: true, title: true },
          }),
        ).toEqual([
          { userId: anna.user.id, title: 'Your data export is ready' },
        ]);
        // Account updates were chosen: one email queued.
        expect(
          await prisma.emailDelivery.findMany({ select: { category: true } }),
        ).toEqual([{ category: 'account' }]);
        expect(
          (await call('GET', '/v1/me/exports', anna)).json().data[0],
        ).toMatchObject({ id, status: 'ready' });
      });

      it('a download link is short-lived, own-export only, audited and needs a recent sign-in', async () => {
        const anna = await as();
        const ben = await as();
        const id = (await request(anna)).json().data.id as string;
        expect((await download(anna, id)).json().error.code).toBe(
          'EXPORT_NOT_READY',
        );
        await build();
        expect((await download(ben, id)).statusCode).toBe(404);
        expect((await download(anna, 'guessed-export-id')).statusCode).toBe(
          404,
        );
        const stale = {
          user: anna.user,
          headers: await headersFor(
            anna.user.id,
            new Date(Date.now() - 60 * 60_000),
          ),
        };
        expect((await download(stale, id)).json().error.code).toBe(
          'REAUTH_REQUIRED',
        );
        const ok = await download(anna, id);
        expect(ok.statusCode).toBe(200);
        expect(ok.headers['cache-control']).toContain('no-store');
        expect(ok.json().data.url).toContain('exports%2F');
        const { storageKey } = await prisma.dataExport.findUniqueOrThrow({
          where: { id },
        });
        expect(storage.lastDownload).toMatchObject({
          key: storageKey,
          disposition: 'attachment',
          contentType: 'application/json',
          expiresIn: 300,
        });
        expect(
          await prisma.auditEvent.count({
            where: {
              action: 'account.export_downloaded',
              actorId: anna.user.id,
            },
          }),
        ).toBe(1);
      });

      it('a suspended or deleting account gets no new link and no export built', async () => {
        const anna = await as();
        const ben = await as();
        const annaId = (await request(anna)).json().data.id as string;
        await build();
        await prisma.user.update({
          where: { id: anna.user.id },
          data: { status: 'SUSPENDED' },
        });
        expect((await download(anna, annaId)).statusCode).toBe(403);
        await prisma.user.update({
          where: { id: anna.user.id },
          data: { status: 'DELETION_PENDING' },
        });
        expect((await download(anna, annaId)).statusCode).toBe(403);
        expect(storage.lastDownload).toBeUndefined();

        const benId = (await request(ben)).json().data.id as string;
        await prisma.user.update({
          where: { id: ben.user.id },
          data: { status: 'SUSPENDED' },
        });
        await build();
        expect(
          await prisma.dataExport.findUniqueOrThrow({ where: { id: benId } }),
        ).toMatchObject({ status: 'FAILED', storageKey: null });
        expect(
          [...storage.objects.keys()].some((key) =>
            key.startsWith(`exports/${ben.user.id}/`),
          ),
        ).toBe(false);
      });

      it('a failed build is retried later, then marked failed; an abandoned build is taken over', async () => {
        const anna = await as();
        const id = (await request(anna)).json().data.id as string;
        storage.failNext = true;
        await build();
        const retry = await prisma.dataExport.findUniqueOrThrow({
          where: { id },
        });
        expect(retry).toMatchObject({ status: 'QUEUED', attempts: 1 });
        expect(retry.availableAt.getTime()).toBeGreaterThan(Date.now());
        // Not before its retry time; then it succeeds.
        expect(await build()).toBe(0);
        await build(new Date(Date.now() + 10 * 60_000));
        expect(
          (await prisma.dataExport.findUniqueOrThrow({ where: { id } })).status,
        ).toBe('READY');

        // Repeated failures end as failed.
        const ben = await as();
        const benId = (await request(ben)).json().data.id as string;
        let clock = Date.now();
        for (let attempt = 0; attempt < EXPORT_MAX_ATTEMPTS; attempt++) {
          storage.failNext = true;
          clock += 2 * 60 * 60_000;
          await build(new Date(clock));
        }
        expect(
          await prisma.dataExport.findUniqueOrThrow({ where: { id: benId } }),
        ).toMatchObject({ status: 'FAILED', attempts: EXPORT_MAX_ATTEMPTS });

        // A build whose builder vanished (lease over) is taken over.
        const cara = await as();
        const caraId = (await request(cara)).json().data.id as string;
        await prisma.dataExport.update({
          where: { id: caraId },
          data: {
            status: 'BUILDING',
            claimToken: 'old-builder',
            leaseUntil: new Date(Date.now() - 1000),
          },
        });
        await build();
        expect(
          (await prisma.dataExport.findUniqueOrThrow({ where: { id: caraId } }))
            .status,
        ).toBe('READY');
      });

      it('expires: file removed through the outbox, link refused, records cleaned up later', async () => {
        const anna = await as();
        const id = (await request(anna)).json().data.id as string;
        await build();
        const key = (
          await prisma.dataExport.findUniqueOrThrow({ where: { id } })
        ).storageKey!;
        const later = new Date(Date.now() + 8 * DAY);
        expect(await expireExports(later)).toEqual({ expired: 1, removed: 0 });
        expect(
          await prisma.dataExport.findUniqueOrThrow({ where: { id } }),
        ).toMatchObject({ status: 'EXPIRED', storageKey: null });
        expect(
          await prisma.notification.count({ where: { entityId: id } }),
        ).toBe(0);
        const removal = await prisma.outboxEvent.findFirstOrThrow({
          where: { topic: STORAGE_REMOVE },
        });
        expect(removal.payload).toEqual({ key });
        await storageRemover()([
          {
            id: removal.id,
            topic: removal.topic,
            payload: removal.payload,
            attempts: 0,
          },
        ]);
        expect(storage.objects.has(key)).toBe(false);
        expect((await download(anna, id)).statusCode).toBe(410);
        // A new export can be requested.
        expect((await request(anna)).statusCode).toBe(202);
        expect(
          await expireExports(new Date(Date.now() + 40 * DAY)),
        ).toMatchObject({ removed: 1 });
      });

      it('at most three requests a day', async () => {
        const anna = await as();
        await prisma.dataExport.createMany({
          data: [1, 2, 3].map(() => ({
            userId: anna.user.id,
            status: 'FAILED' as const,
            finishedAt: new Date(),
          })),
        });
        const limited = await request(anna);
        expect(limited.statusCode).toBe(429);
        expect(limited.json().error.code).toBe('EXPORT_LIMIT');
      });
    });
    describe('export files are fenced and always cleaned up (5B)', () => {
      /** Memory storage whose next upload waits until the test releases it. */
      class HoldingStorage extends MemoryStorage {
        gate: Promise<void> | null = null;
        started: (() => void) | null = null;
        override async put(key: string, body: Uint8Array, type: string) {
          const gate = this.gate;
          this.gate = null;
          if (gate) {
            this.started?.();
            await gate;
          }
          return super.put(key, body, type);
        }
      }
      function holdNextPut(holding: HoldingStorage) {
        let release!: () => void;
        holding.gate = new Promise<void>((resolve) => (release = resolve));
        const started = new Promise<void>(
          (resolve) => (holding.started = resolve),
        );
        return { release, started };
      }
      /** Runs the queued file removals (the outbox) once. */
      async function drainRemovals() {
        const events = await prisma.outboxEvent.findMany({
          where: { topic: STORAGE_REMOVE, processedAt: null },
        });
        await storageRemover()(
          events.map((event) => ({
            id: event.id,
            topic: event.topic,
            payload: event.payload,
            attempts: event.attempts,
          })),
        );
        await prisma.outboxEvent.updateMany({
          where: { id: { in: events.map((event) => event.id) } },
          data: { processedAt: new Date() },
        });
      }
      const exportFiles = (held: MemoryStorage) =>
        [...held.objects.keys()].filter((key) => key.startsWith('exports/'));
      const request = (who: Who) => call('POST', '/v1/me/exports', who);
      /** Starts a build whose upload is held; then lets another take over. */
      async function takeover(holding: HoldingStorage) {
        const slow = holdNextPut(holding);
        const t0 = new Date();
        const first = processExports({
          storage: holding,
          now: () => t0,
          limit: 1,
        });
        await slow.started;
        // Its lease runs out; another builder takes over and finishes.
        await processExports({
          storage: holding,
          now: () => new Date(t0.getTime() + 6 * 60_000),
          limit: 1,
        });
        return { first, release: slow.release };
      }

      /** A build whose upload is held, with its file made old enough to sweep. */
      async function heldBuild(holding: HoldingStorage, leaseLive: boolean) {
        const anna = await as();
        const id = (await request(anna)).json().data.id as string;
        const slow = holdNextPut(holding);
        const building = processExports({ storage: holding, limit: 1 });
        await slow.started;
        await prisma.dataExportFile.updateMany({
          data: { createdAt: new Date(Date.now() - 60 * 60_000) },
        });
        if (!leaseLive)
          await prisma.dataExport.update({
            where: { id },
            data: { leaseUntil: new Date(Date.now() - 1000) },
          });
        const { key } = await prisma.dataExportFile.findFirstOrThrow();
        return { anna, id, key, building, release: slow.release };
      }

      it('a file that becomes ready between the sweep’s choice and its removal is kept', async () => {
        const holding = new HoldingStorage();
        setStorage(holding);
        // Lease over but nobody took over: the builder may still finish.
        const { id, key, building, release } = await heldBuild(holding, false);
        const result = await sweepExportFiles({
          storage: holding,
          beforeDiscard: async () => {
            // The builder finishes after the sweep chose this file.
            release();
            await building;
          },
        });
        expect(result.removed).toBe(0);
        expect(
          await prisma.dataExport.findUniqueOrThrow({ where: { id } }),
        ).toMatchObject({ status: 'READY', storageKey: key });
        expect(
          (await prisma.dataExportFile.findUniqueOrThrow({ where: { key } }))
            .removedAt,
        ).toBeNull();
        await drainRemovals();
        expect(exportFiles(holding)).toEqual([key]);
      });

      it('an attempt whose file was already swept is never made ready; it is built again', async () => {
        const holding = new HoldingStorage();
        setStorage(holding);
        const { id, key, building, release } = await heldBuild(holding, false);
        expect((await sweepExportFiles({ storage: holding })).removed).toBe(1);
        release();
        await building;
        expect(
          await prisma.dataExport.findUniqueOrThrow({ where: { id } }),
        ).toMatchObject({ status: 'QUEUED', storageKey: null });
        expect(
          await prisma.notification.count({ where: { entityId: id } }),
        ).toBe(0);
        // Its late upload is removed straight away, not left for a day.
        await drainRemovals();
        expect(exportFiles(holding)).toEqual([]);
        await processExports({ storage: holding });
        const ready = await prisma.dataExport.findUniqueOrThrow({
          where: { id },
        });
        expect(ready.status).toBe('READY');
        expect(ready.storageKey).not.toBe(key);
        expect(exportFiles(holding)).toEqual([ready.storageKey]);
      });

      it('an old file of the attempt still holding a live lease is not swept', async () => {
        const holding = new HoldingStorage();
        setStorage(holding);
        const { id, key, building, release } = await heldBuild(holding, true);
        expect((await sweepExportFiles({ storage: holding })).removed).toBe(0);
        release();
        await building;
        expect(
          await prisma.dataExport.findUniqueOrThrow({ where: { id } }),
        ).toMatchObject({ status: 'READY', storageKey: key });
        expect(
          await prisma.outboxEvent.count({ where: { topic: STORAGE_REMOVE } }),
        ).toBe(0);
      });

      it('a slow attempt finishing after a takeover can’t replace the ready file, and removes its own', async () => {
        const holding = new HoldingStorage();
        setStorage(holding);
        const anna = await as();
        const id = (await request(anna)).json().data.id as string;
        const { first, release } = await takeover(holding);
        const ready = await prisma.dataExport.findUniqueOrThrow({
          where: { id },
        });
        expect(ready.status).toBe('READY');
        release();
        await first;

        expect(
          await prisma.dataExport.findUniqueOrThrow({ where: { id } }),
        ).toMatchObject({ status: 'READY', storageKey: ready.storageKey });
        const files = await prisma.dataExportFile.findMany();
        expect(files).toHaveLength(2);
        const loser = files.find((file) => file.key !== ready.storageKey)!;
        expect(loser.removedAt).not.toBeNull();
        await drainRemovals();
        expect(exportFiles(holding)).toEqual([ready.storageKey]);
        expect(
          await prisma.notification.count({ where: { entityId: id } }),
        ).toBe(1);
      });

      it('a late attempt after expiry can’t bring back a downloadable file', async () => {
        const holding = new HoldingStorage();
        setStorage(holding);
        const anna = await as();
        const id = (await request(anna)).json().data.id as string;
        const { first, release } = await takeover(holding);
        await expireExports(new Date(Date.now() + 8 * DAY));
        release();
        await first;
        await drainRemovals();
        expect(
          await prisma.dataExport.findUniqueOrThrow({ where: { id } }),
        ).toMatchObject({ status: 'EXPIRED', storageKey: null });
        expect(exportFiles(holding)).toEqual([]);
        expect(
          (await call('POST', `/v1/me/exports/${id}/download`, anna))
            .statusCode,
        ).toBe(410);
      });

      it('a suspension or deletion during the build: never ready, nobody told, file removed', async () => {
        for (const status of ['SUSPENDED', 'DELETION_PENDING'] as const) {
          const holding = new HoldingStorage();
          setStorage(holding);
          const member = await as();
          await savePrefs(member, { emailCare: false, emailAccount: true }, 1);
          const id = (await request(member)).json().data.id as string;
          const slow = holdNextPut(holding);
          const building = processExports({ storage: holding, limit: 1 });
          await slow.started;
          await prisma.user.update({
            where: { id: member.user.id },
            data: { status },
          });
          slow.release();
          await building;
          expect(
            await prisma.dataExport.findUniqueOrThrow({ where: { id } }),
          ).toMatchObject({ status: 'FAILED', storageKey: null });
          expect(
            await prisma.notification.count({ where: { entityId: id } }),
          ).toBe(0);
          expect(
            await prisma.emailDelivery.count({
              where: { userId: member.user.id },
            }),
          ).toBe(0);
          await drainRemovals();
          expect(exportFiles(holding)).toEqual([]);
        }
      });

      it('an upload that never finalizes (a crash) is swept once no upload can still land; the retry succeeds', async () => {
        const anna = await as();
        const id = (await request(anna)).json().data.id as string;
        let crashed = '';
        await processExports({
          storage,
          afterUpload: async (key) => {
            crashed = key;
            throw new Error('process stopped');
          },
        });
        expect(
          await prisma.dataExport.findUniqueOrThrow({ where: { id } }),
        ).toMatchObject({ status: 'QUEUED', attempts: 1 });
        expect(storage.objects.has(crashed)).toBe(true);
        // Not swept while that attempt's upload could still be finishing.
        expect((await sweepExportFiles({ storage })).removed).toBe(0);
        const sweepAt = new Date(Date.now() + FILE_SWEEP_GRACE_MS + 1000);
        expect(
          (await sweepExportFiles({ storage, now: sweepAt })).removed,
        ).toBe(1);
        await drainRemovals();
        expect(storage.objects.has(crashed)).toBe(false);

        await processExports({
          storage,
          now: () => new Date(Date.now() + 10 * 60_000),
        });
        const ready = await prisma.dataExport.findUniqueOrThrow({
          where: { id },
        });
        expect(ready.status).toBe('READY');
        expect(ready.storageKey).not.toBe(crashed);
        expect(exportFiles(storage)).toEqual([ready.storageKey]);
      });

      it('a removed file that reappears (a very late upload) is removed again; records go after a day', async () => {
        const anna = await as();
        const key = `exports/${anna.user.id}/gone/attempt.json`;
        const now = new Date();
        await prisma.dataExportFile.create({
          data: {
            key,
            exportId: 'gone',
            userId: anna.user.id,
            removedAt: new Date(now.getTime() - 10 * 60_000),
          },
        });
        await storage.put(key, new Uint8Array([1]), 'application/json');
        expect(await sweepExportFiles({ storage, now })).toMatchObject({
          reappeared: 1,
        });
        await drainRemovals();
        expect(storage.objects.has(key)).toBe(false);
        expect(
          await sweepExportFiles({
            storage,
            now: new Date(now.getTime() + 2 * DAY),
          }),
        ).toMatchObject({ forgotten: 1 });
        expect(await prisma.dataExportFile.count()).toBe(0);
      });
    });
  },
);
