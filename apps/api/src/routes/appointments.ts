import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  appointmentConfirmSchema,
  appointmentDeleteAfter,
  appointmentInputSchema,
  appointmentNoteInputSchema,
  appointmentSlotSchema,
  appointmentStatuses,
  nzLocalToUtc,
  terminalAppointmentStatuses,
  type AppointmentHistoryEntry,
  type AppointmentSlot,
  type AppointmentStatus,
  type MemberAppointment,
  type PreferredTime,
  type StaffAppointment,
  type StaffAppointmentDetail,
} from '@grace-abounds/validation';
import {
  prisma,
  Prisma,
  recordAudit,
  Role,
  type Appointment as AppointmentRow,
} from '@grace-abounds/database';
import {
  AppError,
  notFound,
  parse,
  requireVersion,
  versionConflict,
} from '../lib/errors.js';
import { requireActor, requireRole, type Actor } from '../lib/identity.js';
import { notify } from '../lib/notifications.js';

/*
 * Private appointments (Phase 4B).
 *
 * Member (own only; anyone else's is 404):
 *   GET  /v1/member/appointments
 *   GET  /v1/member/appointments/:id
 *   POST /v1/member/appointments                  ask (retry-safe via clientKey)
 *   POST /v1/member/appointments/:id/accept       take the suggested time
 *   POST /v1/member/appointments/:id/another-time ask for a different time
 *   POST /v1/member/appointments/:id/cancel
 * Staff (Pastor and Admin; Admin gets logistics only):
 *   GET  /v1/staff/appointments?status=
 *   GET  /v1/staff/appointments/:id
 *   POST /v1/staff/appointments/:id/propose       suggest a time (no reservation)
 *   POST /v1/staff/appointments/:id/confirm       reserve the suggested or a given time
 *   POST /v1/staff/appointments/:id/cancel
 *   POST /v1/staff/appointments/:id/complete
 *   POST /v1/staff/appointments/:id/decline       Pastor only
 *   POST /v1/staff/appointments/:id/notes         Pastor only
 *
 * Every change needs the version the screen loaded (If-Match), is audited
 * without its words or times, and writes generic notifications in the same
 * transaction, once per transition. Suggesting or reserving a time takes one
 * schedule lock, so two confirmations can't take overlapping times; only
 * CONFIRMED appointments hold their time. Nothing here touches activities,
 * the public calendar or Google.
 */

type Tx = Prisma.TransactionClient;
type Row = AppointmentRow & {
  events: {
    status: AppointmentRow['status'];
    startsAt: Date | null;
    endsAt: Date | null;
    createdAt: Date;
  }[];
};

const SCHEDULE_LOCK = 4_242_001;
const fromDb = (status: AppointmentRow['status']) =>
  status.toLowerCase() as AppointmentStatus;
const toDb = (status: AppointmentStatus) =>
  status.toUpperCase() as AppointmentRow['status'];
const iso = (value: Date | null) => value?.toISOString() ?? '';
const withEvents = { events: { orderBy: { createdAt: 'asc' as const } } };

function logistics(row: Row) {
  const closedAt = iso(row.closedAt);
  const history: AppointmentHistoryEntry[] = row.events.map((event) => ({
    status: fromDb(event.status),
    at: event.createdAt.toISOString(),
    startsAt: iso(event.startsAt),
    endsAt: iso(event.endsAt),
  }));
  return {
    id: row.id,
    status: fromDb(row.status),
    preferredDate: row.preferredDate?.toISOString().slice(0, 10) ?? '',
    preferredTime: row.preferredTime as PreferredTime,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    location: row.location,
    createdAt: row.createdAt.toISOString(),
    closedAt,
    deleteAfter: closedAt
      ? appointmentDeleteAfter(closedAt, iso(row.startsAt))
      : '',
    history,
  };
}
const toMember = (row: Row): MemberAppointment => ({
  ...logistics(row),
  version: row.version,
  topic: row.topic,
  reason: row.reason,
});

type StaffRow = Row & {
  user: { name: string | null; email: string; phone: string };
  _count: { notes: number };
};
const forStaff = {
  ...withEvents,
  user: { select: { name: true, email: true, phone: true } },
  _count: { select: { notes: true } },
};
/** Admin gets logistics only: the confidential fields are left out. */
function toStaff(row: StaffRow, pastor: boolean): StaffAppointment {
  return {
    ...logistics(row),
    version: row.version,
    member: {
      name: row.user.name?.trim() || row.user.email,
      email: row.user.email,
      phone: row.user.phone,
    },
    ...(pastor && {
      topic: row.topic,
      reason: row.reason,
      noteCount: row._count.notes,
    }),
  };
}

const memberLink = (id: string) => `/members/appointments?appointment=${id}`;
const staffLink = (role: Role, id: string) =>
  role === Role.PASTOR
    ? `/pastor/care?appointment=${id}`
    : `/admin/appointments?appointment=${id}`;

/** The active Pastor and Admin accounts. */
async function staffAccounts(tx: Tx) {
  return tx.user.findMany({
    where: { role: { in: [Role.PASTOR, Role.ADMIN] }, status: 'ACTIVE' },
    select: { id: true, role: true },
  });
}
async function tellStaff(
  tx: Tx,
  row: { id: string },
  version: number,
  except: string,
  title: string,
  body: string,
) {
  for (const person of await staffAccounts(tx))
    if (person.id !== except)
      await notify(tx, {
        userIds: [person.id],
        kind: 'appointment',
        title,
        body,
        href: staffLink(person.role, row.id),
        entityType: 'appointment',
        entityId: row.id,
        dedupe: `appointment:${row.id}:v${version}`,
      });
}
function tellMember(
  tx: Tx,
  row: { id: string; userId: string },
  version: number,
  title: string,
  body = '',
) {
  return notify(tx, {
    userIds: [row.userId],
    kind: 'appointment',
    title,
    body,
    href: memberLink(row.id),
    entityType: 'appointment',
    entityId: row.id,
    dedupe: `appointment:${row.id}:v${version}`,
  });
}

/** A suggested or confirmed time, checked and turned into instants. */
function slotTimes(slot: AppointmentSlot, now: Date) {
  const startsAt = nzLocalToUtc(slot.date, slot.time);
  const endsAt = new Date(startsAt.getTime() + slot.minutes * 60_000);
  if (startsAt <= now)
    throw new AppError(
      422,
      'VALIDATION_FAILED',
      'Choose a time in the future.',
      {
        'slot.date': 'Choose a time in the future.',
      },
    );
  return { startsAt, endsAt, location: slot.location };
}

const transitionMessages: Partial<Record<AppointmentStatus, string>> = {
  requested: 'It isn’t waiting for a time any more.',
  proposed: 'A time has already been suggested.',
  confirmed: 'It is already confirmed.',
};

type Change = {
  actor: Actor;
  request: FastifyRequest;
  id: string;
  expected: number;
  /** Members change only their own. */
  ownerOnly?: boolean;
  from: AppointmentStatus[];
  to: AppointmentStatus;
  /** A new time, or keep the suggested one (which must still be ahead). */
  slot?: { startsAt: Date; endsAt: Date; location: string } | 'keep';
  /** Reserving (confirm) must not overlap another confirmed time. */
  reserve?: boolean;
  /** Suggesting checks against confirmed times too, without reserving. */
  checkFree?: boolean;
  tell: (tx: Tx, row: AppointmentRow, version: number) => Promise<void>;
};

async function change(input: Change) {
  return prisma.$transaction(async (tx) => {
    // One schedule lock while times are checked and taken.
    if (input.reserve || input.checkFree)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SCHEDULE_LOCK})::text`;
    const row = await tx.appointment.findUnique({ where: { id: input.id } });
    if (!row || (input.ownerOnly && row.userId !== input.actor.id))
      throw notFound('Appointment');
    if (row.version !== input.expected) throw versionConflict();
    const from = fromDb(row.status);
    if (!input.from.includes(from))
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        (terminalAppointmentStatuses.includes(from)
          ? 'This appointment is already closed.'
          : transitionMessages[from]) ??
          'This appointment can’t change that way now.',
      );
    const now = new Date();
    let times: { startsAt: Date; endsAt: Date; location: string } | null = null;
    if (input.slot === 'keep') {
      if (!row.startsAt || !row.endsAt || row.startsAt <= now)
        throw new AppError(
          409,
          'NO_TIME',
          'There’s no upcoming suggested time to confirm.',
        );
      times = {
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        location: row.location,
      };
    } else if (input.slot) times = input.slot;
    if (times && (input.reserve || input.checkFree)) {
      const taken = await tx.appointment.findFirst({
        where: {
          id: { not: row.id },
          status: 'CONFIRMED',
          startsAt: { lt: times.endsAt },
          endsAt: { gt: times.startsAt },
        },
        select: { id: true },
      });
      if (taken)
        throw new AppError(
          409,
          'SLOT_TAKEN',
          'That time overlaps another confirmed appointment. Choose another time.',
        );
    }
    const closing = terminalAppointmentStatuses.includes(input.to);
    const changed = await tx.appointment.updateMany({
      where: { id: row.id, version: input.expected, status: row.status },
      data: {
        status: toDb(input.to),
        version: { increment: 1 },
        ...(times && {
          startsAt: times.startsAt,
          endsAt: times.endsAt,
          location: times.location,
        }),
        // Asking for another time clears the suggestion.
        ...(input.to === 'requested' && { startsAt: null, endsAt: null }),
        ...(closing && { closedAt: now }),
      },
    });
    if (changed.count === 0) throw versionConflict();
    const version = input.expected + 1;
    const saved = (await tx.appointment.findUnique({ where: { id: row.id } }))!;
    await tx.appointmentEvent.create({
      data: {
        appointmentId: row.id,
        status: toDb(input.to),
        startsAt: saved.startsAt,
        endsAt: saved.endsAt,
      },
    });
    await recordAudit(tx, {
      actorId: input.actor.id,
      action: `care.appointment_${input.to}`,
      entityType: 'appointment',
      entityId: row.id,
      requestId: input.request.id,
      metadata: { from, to: input.to, version },
    });
    await input.tell(tx, saved, version);
    return saved;
  });
}

export function registerAppointmentRoutes(app: FastifyInstance) {
  const noStore = (reply: FastifyReply) =>
    reply.header('cache-control', 'private, no-store');
  const staff = (request: FastifyRequest) =>
    requireRole(request, Role.PASTOR, Role.ADMIN);

  async function memberView(id: string) {
    const row = await prisma.appointment.findUnique({
      where: { id },
      include: withEvents,
    });
    return toMember(row!);
  }
  async function staffView(
    id: string,
    pastor: boolean,
  ): Promise<StaffAppointmentDetail> {
    const row = await prisma.appointment.findUnique({
      where: { id },
      include: {
        ...forStaff,
        ...(pastor && { notes: { orderBy: { createdAt: 'asc' } } }),
      },
    });
    if (!row) throw notFound('Appointment');
    const detail: StaffAppointmentDetail = toStaff(row, pastor);
    if (pastor) {
      const notes = (
        row as typeof row & {
          notes: {
            id: string;
            text: string;
            authorId: string | null;
            createdAt: Date;
          }[];
        }
      ).notes;
      const authors = await prisma.user.findMany({
        where: {
          id: {
            in: notes
              .map((note) => note.authorId)
              .filter((value): value is string => !!value),
          },
        },
        select: { id: true, name: true, email: true },
      });
      detail.notes = notes.map((note) => {
        const author = authors.find((user) => user.id === note.authorId);
        return {
          id: note.id,
          text: note.text,
          author: author ? author.name?.trim() || author.email : 'Pastor',
          createdAt: note.createdAt.toISOString(),
        };
      });
    }
    return detail;
  }

  // ---------- Member: own only ----------
  app.get('/v1/member/appointments', async (request, reply) => {
    const actor = requireActor(request);
    const rows = await prisma.appointment.findMany({
      where: { userId: actor.id },
      include: withEvents,
      orderBy: { createdAt: 'desc' },
    });
    noStore(reply);
    return { data: rows.map(toMember) };
  });

  app.get<{ Params: { id: string } }>(
    '/v1/member/appointments/:id',
    async (request, reply) => {
      const actor = requireActor(request);
      const row = await prisma.appointment.findFirst({
        where: { id: request.params.id, userId: actor.id },
        include: withEvents,
      });
      if (!row) throw notFound('Appointment');
      noStore(reply);
      return { data: toMember(row), version: row.version };
    },
  );

  app.post('/v1/member/appointments', async (request, reply) => {
    const actor = requireActor(request);
    const input = parse(appointmentInputSchema, request.body ?? {});
    const preferredDate = input.preferredDate
      ? new Date(`${input.preferredDate}T00:00:00Z`)
      : null;
    const existing = () =>
      prisma.appointment.findUnique({
        where: {
          userId_clientKey: { userId: actor.id, clientKey: input.clientKey },
        },
        include: withEvents,
      });
    // A retry of the same request returns the one already made; the same
    // key with anything different is refused, never passed off as success.
    const replay = (row: Row) => {
      if (
        row.topic !== input.topic ||
        row.reason !== input.reason ||
        (row.preferredDate?.toISOString().slice(0, 10) ?? '') !==
          input.preferredDate ||
        row.preferredTime !== input.preferredTime
      )
        throw new AppError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request was already sent with different details. Your details are still here; send them again as a new request.',
        );
      noStore(reply);
      return reply
        .status(200)
        .send({ data: toMember(row), version: row.version });
    };
    const before = await existing();
    if (before) return replay(before);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.appointment.create({
          data: {
            userId: actor.id,
            topic: input.topic,
            reason: input.reason,
            preferredDate,
            preferredTime: input.preferredTime,
            clientKey: input.clientKey,
            events: { create: { status: 'REQUESTED' } },
          },
          include: withEvents,
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'care.appointment_requested',
          entityType: 'appointment',
          entityId: row.id,
          requestId: request.id,
        });
        await tellStaff(
          tx,
          row,
          1,
          actor.id,
          'New appointment request',
          'A member asked for an appointment.',
        );
        return row;
      });
      noStore(reply);
      return reply
        .status(201)
        .send({ data: toMember(created), version: created.version });
    } catch (error) {
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

  const memberAction = (
    path: string,
    from: AppointmentStatus[],
    to: AppointmentStatus,
    extra: Pick<Change, 'slot' | 'reserve'>,
    title: string,
    body: string,
  ) =>
    app.post<{ Params: { id: string } }>(
      `/v1/member/appointments/:id/${path}`,
      async (request, reply) => {
        const actor = requireActor(request);
        const expected = requireVersion(request.headers['if-match']);
        const saved = await change({
          actor,
          request,
          id: request.params.id,
          expected,
          ownerOnly: true,
          from,
          to,
          ...extra,
          tell: (tx, row, version) =>
            tellStaff(tx, row, version, actor.id, title, body),
        });
        noStore(reply);
        reply.header('etag', `"${saved.version}"`);
        return { data: await memberView(saved.id), version: saved.version };
      },
    );
  memberAction(
    'accept',
    ['proposed'],
    'confirmed',
    { slot: 'keep', reserve: true },
    'An appointment was confirmed',
    'A member accepted the suggested time.',
  );
  memberAction(
    'another-time',
    ['proposed'],
    'requested',
    {},
    'A member asked for another time',
    'Suggest a different time for this appointment.',
  );
  memberAction(
    'cancel',
    ['requested', 'proposed', 'confirmed'],
    'cancelled',
    {},
    'An appointment was cancelled',
    'A member cancelled their appointment.',
  );

  // ---------- Staff: Pastor everything, Admin logistics ----------
  app.get<{ Querystring: { status?: string } }>(
    '/v1/staff/appointments',
    async (request, reply) => {
      const actor = staff(request);
      const status = request.query.status;
      const rows = await prisma.appointment.findMany({
        where:
          status && (appointmentStatuses as readonly string[]).includes(status)
            ? { status: toDb(status as AppointmentStatus) }
            : {},
        include: forStaff,
        orderBy: { createdAt: 'desc' },
      });
      noStore(reply);
      return {
        data: rows.map((row) => toStaff(row, actor.role === Role.PASTOR)),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/v1/staff/appointments/:id',
    async (request, reply) => {
      const actor = staff(request);
      const detail = await staffView(
        request.params.id,
        actor.role === Role.PASTOR,
      );
      noStore(reply);
      reply.header('etag', `"${detail.version}"`);
      return { data: detail, version: detail.version };
    },
  );

  const staffAction = <T>(
    path: string,
    options: {
      pastorOnly?: boolean;
      body?: (raw: unknown) => T;
      change: (
        input: T,
      ) => Omit<Change, 'actor' | 'request' | 'id' | 'expected' | 'tell'>;
      title: string;
      message: string;
    },
  ) =>
    app.post<{ Params: { id: string } }>(
      `/v1/staff/appointments/:id/${path}`,
      async (request, reply) => {
        const actor = options.pastorOnly
          ? requireRole(request, Role.PASTOR)
          : staff(request);
        const expected = requireVersion(request.headers['if-match']);
        const input = options.body
          ? options.body(request.body ?? {})
          : (undefined as T);
        const saved = await change({
          actor,
          request,
          id: request.params.id,
          expected,
          ...options.change(input),
          tell: (tx, row, version) =>
            tellMember(tx, row, version, options.title, options.message),
        });
        noStore(reply);
        const detail = await staffView(saved.id, actor.role === Role.PASTOR);
        reply.header('etag', `"${detail.version}"`);
        return { data: detail, version: detail.version };
      },
    );

  staffAction('propose', {
    body: (raw) => parse(appointmentSlotSchema, raw),
    change: (slot) => ({
      from: ['requested', 'proposed', 'confirmed'],
      to: 'proposed',
      slot: slotTimes(slot, new Date()),
      checkFree: true,
    }),
    title: 'A time was suggested for your appointment',
    message: 'Open it to accept the time or ask for another.',
  });
  staffAction('confirm', {
    body: (raw) => parse(appointmentConfirmSchema, raw),
    change: ({ slot }) => ({
      from: ['requested', 'proposed'],
      to: 'confirmed',
      slot: slot ? slotTimes(slot, new Date()) : 'keep',
      reserve: true,
    }),
    title: 'Your appointment is confirmed',
    message: 'Open it to see the time and place.',
  });
  staffAction('cancel', {
    change: () => ({
      from: ['requested', 'proposed', 'confirmed'],
      to: 'cancelled',
    }),
    title: 'Your appointment was cancelled',
    message: 'Open it for details, or ask for a new appointment.',
  });
  staffAction('complete', {
    change: () => ({ from: ['confirmed'], to: 'completed' }),
    title: 'Your appointment was marked as completed',
    message: '',
  });
  staffAction('decline', {
    pastorOnly: true,
    change: () => ({ from: ['requested', 'proposed'], to: 'declined' }),
    title: 'Your appointment request was declined',
    message: 'You’re welcome to contact the church or ask again.',
  });

  app.post<{ Params: { id: string } }>(
    '/v1/staff/appointments/:id/notes',
    async (request, reply) => {
      const actor = requireRole(request, Role.PASTOR);
      const expected = requireVersion(request.headers['if-match']);
      const { text } = parse(appointmentNoteInputSchema, request.body ?? {});
      await prisma.$transaction(async (tx) => {
        const changed = await tx.appointment.updateMany({
          where: { id: request.params.id, version: expected },
          data: { version: { increment: 1 } },
        });
        if (changed.count === 0) {
          const exists = await tx.appointment.findUnique({
            where: { id: request.params.id },
            select: { id: true },
          });
          if (!exists) throw notFound('Appointment');
          throw versionConflict();
        }
        const note = await tx.appointmentNote.create({
          data: {
            appointmentId: request.params.id,
            text,
            authorId: actor.id,
          },
        });
        await recordAudit(tx, {
          actorId: actor.id,
          action: 'care.appointment_note_added',
          entityType: 'appointment',
          entityId: request.params.id,
          requestId: request.id,
          metadata: { noteId: note.id, version: expected + 1 },
        });
      });
      const detail = await staffView(request.params.id, true);
      noStore(reply);
      reply.header('etag', `"${detail.version}"`);
      reply.status(201);
      return { data: detail, version: detail.version };
    },
  );
}
