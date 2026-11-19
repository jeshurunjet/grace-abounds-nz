import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  nextPrayerStatuses,
  prayerDeleteAfter,
  prayerInputSchema,
  prayerNoteInputSchema,
  prayerStatusInputSchema,
  prayerStatuses,
  type MemberPrayer,
  type PastorPrayer,
  type PastorPrayerDetail,
  type PrayerStatus,
} from '@grace-abounds/validation';
import {
  prisma,
  Prisma,
  recordAudit,
  Role,
  type PrayerRequest as PrayerRow,
} from '@grace-abounds/database';
import {
  AppError,
  notFound,
  parse,
  requireVersion,
  versionConflict,
} from '../lib/errors.js';
import { requireActor, requireRole } from '../lib/identity.js';
import { notify, pastorIds } from '../lib/notifications.js';

/*
 * Prayer requests (Phase 4A). Members see only their own; the Pastor sees
 * all, with private notes; Admin has no route here at all (403), so no
 * prayer, count or note reaches Admin through any endpoint or guessed id.
 *
 *   GET  /v1/member/prayers              my requests and their history
 *   GET  /v1/member/prayers/:id          one of mine (404 for anyone else's)
 *   POST /v1/member/prayers              submit (retry-safe via clientKey;
 *                                        same key, different words: 409)
 *   GET  /v1/pastor/prayers?status=      every request (Pastor)
 *   GET  /v1/pastor/prayers/:id          one, with private notes (Pastor)
 *   POST /v1/pastor/prayers/:id/status   Praying / Prayed for (If-Match)
 *   POST /v1/pastor/prayers/:id/notes    add a private note (If-Match)
 *
 * Every write is audited without the text. Notifications are written in
 * the same transaction: the Pastor when a request arrives, the member when
 * the Pastor starts praying or has prayed, once per transition.
 */

type Tx = Prisma.TransactionClient;
type WithEvents = PrayerRow & {
  events: { status: PrayerRow['status']; createdAt: Date }[];
};

const fromDb = (status: PrayerRow['status']) =>
  status.toLowerCase() as PrayerStatus;
const toDb = (status: PrayerStatus) =>
  status.toUpperCase() as PrayerRow['status'];
const withEvents = {
  events: { orderBy: { createdAt: 'asc' as const } },
};

function toMemberPrayer(row: WithEvents): MemberPrayer {
  const closedAt = row.closedAt?.toISOString() ?? '';
  return {
    id: row.id,
    text: row.text,
    status: fromDb(row.status),
    createdAt: row.createdAt.toISOString(),
    closedAt,
    deleteAfter: closedAt ? prayerDeleteAfter(closedAt) : '',
    history: row.events.map((event) => ({
      status: fromDb(event.status),
      at: event.createdAt.toISOString(),
    })),
  };
}

type PastorRow = WithEvents & {
  user: { name: string | null; email: string };
  _count: { notes: number };
};
const forPastor = {
  ...withEvents,
  user: { select: { name: true, email: true } },
  _count: { select: { notes: true } },
};
function toPastorPrayer(row: PastorRow): PastorPrayer {
  return {
    ...toMemberPrayer(row),
    version: row.version,
    member: {
      name: row.user.name?.trim() || row.user.email,
      email: row.user.email,
    },
    noteCount: row._count.notes,
  };
}

const memberLink = (id: string) => `/members/prayer?request=${id}`;
const pastorLink = (id: string) => `/pastor/care?prayer=${id}`;

/** The member hears about meaningful Pastor actions, generically. */
const statusMessages: Partial<Record<PrayerStatus, string>> = {
  praying: 'The pastor is praying for your request.',
  prayed_for: 'The pastor has prayed for your request.',
};

export function registerCareRoutes(app: FastifyInstance) {
  const noStore = (reply: FastifyReply) =>
    reply.header('cache-control', 'private, no-store');
  const pastor = (request: Parameters<typeof requireRole>[0]) =>
    requireRole(request, Role.PASTOR);

  // ---------- Member: own requests only ----------
  app.get('/v1/member/prayers', async (request, reply) => {
    const actor = requireActor(request);
    const rows = await prisma.prayerRequest.findMany({
      where: { userId: actor.id },
      include: withEvents,
      orderBy: { createdAt: 'desc' },
    });
    noStore(reply);
    return { data: rows.map(toMemberPrayer) };
  });

  app.get<{ Params: { id: string } }>(
    '/v1/member/prayers/:id',
    async (request, reply) => {
      const actor = requireActor(request);
      // Someone else's request is simply not found.
      const row = await prisma.prayerRequest.findFirst({
        where: { id: request.params.id, userId: actor.id },
        include: withEvents,
      });
      if (!row) throw notFound('Prayer request');
      noStore(reply);
      return { data: toMemberPrayer(row) };
    },
  );

  app.post('/v1/member/prayers', async (request, reply) => {
    const actor = requireActor(request);
    const input = parse(prayerInputSchema, request.body ?? {});
    const existing = () =>
      prisma.prayerRequest.findUnique({
        where: {
          userId_clientKey: { userId: actor.id, clientKey: input.clientKey },
        },
        include: withEvents,
      });
    // A retry of the same submission returns the request already made;
    // the same key with different words is a different submission and is
    // refused, never reported as the old one's success.
    const replay = (row: WithEvents) => {
      if (row.text !== input.text)
        throw new AppError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request was already sent with different words. Your text is still here; send it again as a new request.',
        );
      noStore(reply);
      return reply.status(200).send({ data: toMemberPrayer(row) });
    };
    const before = await existing();
    if (before) return replay(before);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.prayerRequest.create({
          data: {
            userId: actor.id,
            text: input.text,
            clientKey: input.clientKey,
            events: { create: { status: 'SUBMITTED' } },
          },
          include: withEvents,
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'care.prayer_submitted',
          entityType: 'prayer',
          entityId: row.id,
          requestId: request.id,
        });
        await notify(tx, {
          userIds: (await pastorIds(tx)).filter((id) => id !== actor.id),
          kind: 'prayer.submitted',
          title: 'New prayer request',
          body: 'A member has sent a prayer request.',
          href: pastorLink(row.id),
          entityType: 'prayer',
          entityId: row.id,
          dedupe: `prayer:${row.id}:submitted`,
        });
        return row;
      });
      noStore(reply);
      return reply.status(201).send({ data: toMemberPrayer(created) });
    } catch (error) {
      // Two simultaneous retries: the other one created it.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await existing();
        if (raced) return replay(raced);
      }
      throw error;
    }
  });

  // ---------- Pastor: every request, private notes ----------
  app.get<{ Querystring: { status?: string } }>(
    '/v1/pastor/prayers',
    async (request, reply) => {
      pastor(request);
      const status = request.query.status;
      const filter =
        status && (prayerStatuses as readonly string[]).includes(status)
          ? { status: toDb(status as PrayerStatus) }
          : {};
      const rows = await prisma.prayerRequest.findMany({
        where: filter,
        include: forPastor,
        orderBy: { createdAt: 'desc' },
      });
      noStore(reply);
      return { data: rows.map(toPastorPrayer) };
    },
  );

  async function pastorDetail(tx: Tx | typeof prisma, id: string) {
    const row = await tx.prayerRequest.findUnique({
      where: { id },
      include: {
        ...forPastor,
        notes: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) throw notFound('Prayer request');
    const authors = await tx.user.findMany({
      where: {
        id: {
          in: row.notes
            .map((note) => note.authorId)
            .filter((value): value is string => !!value),
        },
      },
      select: { id: true, name: true, email: true },
    });
    const author = (id: string | null) => {
      const user = authors.find((item) => item.id === id);
      return user ? user.name?.trim() || user.email : 'Pastor';
    };
    const detail: PastorPrayerDetail = {
      ...toPastorPrayer(row),
      notes: row.notes.map((note) => ({
        id: note.id,
        text: note.text,
        author: author(note.authorId),
        createdAt: note.createdAt.toISOString(),
      })),
    };
    return detail;
  }

  app.get<{ Params: { id: string } }>(
    '/v1/pastor/prayers/:id',
    async (request, reply) => {
      pastor(request);
      const detail = await pastorDetail(prisma, request.params.id);
      noStore(reply);
      reply.header('etag', `"${detail.version}"`);
      return { data: detail, version: detail.version };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/pastor/prayers/:id/status',
    async (request, reply) => {
      const actor = pastor(request);
      const expected = requireVersion(request.headers['if-match']);
      const { status } = parse(prayerStatusInputSchema, request.body ?? {});
      const detail = await prisma.$transaction(async (tx) => {
        const row = await tx.prayerRequest.findUnique({
          where: { id: request.params.id },
        });
        if (!row) throw notFound('Prayer request');
        if (row.version !== expected) throw versionConflict();
        const from = fromDb(row.status);
        if (!nextPrayerStatuses[from].includes(status))
          throw new AppError(
            409,
            'INVALID_TRANSITION',
            from === 'prayed_for'
              ? 'This request is already marked as prayed for.'
              : 'This request is already praying.',
          );
        // Conditional on the version and status read: one transition wins.
        const changed = await tx.prayerRequest.updateMany({
          where: { id: row.id, version: expected, status: row.status },
          data: {
            status: toDb(status),
            version: { increment: 1 },
            ...(status === 'prayed_for' && { closedAt: new Date() }),
          },
        });
        if (changed.count === 0) throw versionConflict();
        await tx.prayerEvent.create({
          data: { prayerId: row.id, status: toDb(status) },
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'care.prayer_status_changed',
          entityType: 'prayer',
          entityId: row.id,
          requestId: request.id,
          metadata: { from, to: status, version: expected + 1 },
        });
        await notify(tx, {
          userIds: [row.userId],
          kind: 'prayer.status',
          title: 'Your prayer request was updated',
          body: statusMessages[status] ?? '',
          href: memberLink(row.id),
          entityType: 'prayer',
          entityId: row.id,
          dedupe: `prayer:${row.id}:${status}`,
        });
        return pastorDetail(tx, row.id);
      });
      noStore(reply);
      reply.header('etag', `"${detail.version}"`);
      return { data: detail, version: detail.version };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/pastor/prayers/:id/notes',
    async (request, reply) => {
      const actor = pastor(request);
      const expected = requireVersion(request.headers['if-match']);
      const { text } = parse(prayerNoteInputSchema, request.body ?? {});
      const detail = await prisma.$transaction(async (tx) => {
        const changed = await tx.prayerRequest.updateMany({
          where: { id: request.params.id, version: expected },
          data: { version: { increment: 1 } },
        });
        if (changed.count === 0) {
          const exists = await tx.prayerRequest.findUnique({
            where: { id: request.params.id },
            select: { id: true },
          });
          if (!exists) throw notFound('Prayer request');
          throw versionConflict();
        }
        const note = await tx.prayerNote.create({
          data: { prayerId: request.params.id, text, authorId: actor.id },
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'care.prayer_note_added',
          entityType: 'prayer',
          entityId: request.params.id,
          requestId: request.id,
          metadata: { noteId: note.id, version: expected + 1 },
        });
        return pastorDetail(tx, request.params.id);
      });
      noStore(reply);
      reply.header('etag', `"${detail.version}"`);
      reply.status(201);
      return { data: detail, version: detail.version };
    },
  );
}
