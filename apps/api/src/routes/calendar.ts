import type { FastifyInstance } from 'fastify';
import { isRealDate, scheduleDates, toIcs } from '@grace-abounds/validation';
import { prisma, recordAudit, Role } from '@grace-abounds/database';
import { notFound } from '../lib/errors.js';
import { requireRole } from '../lib/identity.js';
import { calendarSyncState, requestSync } from '../lib/calendar-sync.js';
import { toActivity } from './activities.js';

/*
 * Calendar export and Google Calendar sync status (Phase 3C).
 *
 *   GET  /v1/public/activities/:slug/calendar.ics?date=   .ics, one date or the series
 *   GET  /v1/staff/calendar-sync                          Google sync state (Pastor, Admin)
 *   POST /v1/staff/calendar-sync/retry                    retry every failed activity
 *   POST /v1/staff/calendar-sync/:activityId/retry        retry one activity
 *
 * Exports carry only public fields, like the Google events.
 */

export function registerCalendarRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string }; Querystring: { date?: string } }>(
    '/v1/public/activities/:slug/calendar.ics',
    async (request, reply) => {
      const row = await prisma.activity.findUnique({
        where: { slug: request.params.slug },
        include: { exceptions: true },
      });
      const activity = row ? toActivity(row) : null;
      // Only published, live activities have an export.
      if (!row || !activity || activity.status !== 'published')
        throw notFound('Activity');
      const date = request.query.date ?? '';
      if (
        date &&
        (!isRealDate(date) ||
          !scheduleDates(activity.schedule, date, date).length)
      )
        throw notFound('Date');
      const campus = row.locationKey
        ? await prisma.location.findFirst({
            where: { key: row.locationKey, status: 'PUBLISHED' },
            select: { name: true, address: true },
          })
        : null;
      const placeFor = (venue: string) =>
        [venue, campus?.name, campus?.address].filter(Boolean).join(', ');
      const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
      const ics = toIcs(activity, {
        exceptions: row.exceptions.map((item) => ({
          id: item.id,
          activityId: item.activityId,
          date: item.date.toISOString().slice(0, 10),
          kind: item.kind as 'cancelled' | 'changed',
          note: item.note,
          startTime: item.startTime,
          endTime: item.endTime,
          venue: item.venue,
        })),
        location: placeFor(row.venue),
        placeFor,
        date: date || undefined,
        url: site ? `${site}/events/${row.slug}` : undefined,
        sequence: row.version,
      });
      reply
        .header('content-type', 'text/calendar; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="${row.slug}${date ? `-${date}` : ''}.ics"`,
        )
        .header('cache-control', 'no-store');
      return ics;
    },
  );

  app.get('/v1/staff/calendar-sync', async (request, reply) => {
    requireRole(request, Role.PASTOR, Role.ADMIN);
    reply.header('cache-control', 'private, no-store');
    return { data: await calendarSyncState() };
  });

  app.post('/v1/staff/calendar-sync/retry', async (request, reply) => {
    const actor = requireRole(request, Role.PASTOR, Role.ADMIN);
    const failed = await prisma.calendarSync.findMany({
      where: { status: 'failed' },
      select: { activityId: true },
    });
    for (const item of failed) await requestSync(item.activityId);
    await recordAudit(prisma, {
      actorId: actor.id,
      action: 'calendar.sync_retried',
      entityType: 'calendar',
      entityId: 'google',
      requestId: request.id,
      metadata: { count: failed.length },
    });
    reply.header('cache-control', 'private, no-store');
    return { data: await calendarSyncState() };
  });

  app.post<{ Params: { activityId: string } }>(
    '/v1/staff/calendar-sync/:activityId/retry',
    async (request, reply) => {
      const actor = requireRole(request, Role.PASTOR, Role.ADMIN);
      const known = await prisma.calendarSync.findUnique({
        where: { activityId: request.params.activityId },
        select: { activityId: true },
      });
      const exists = await prisma.activity.findUnique({
        where: { id: request.params.activityId },
        select: { id: true },
      });
      if (!known && !exists) throw notFound('Activity');
      await requestSync(request.params.activityId);
      await recordAudit(prisma, {
        actorId: actor.id,
        action: 'calendar.sync_retried',
        entityType: 'activity',
        entityId: request.params.activityId,
        requestId: request.id,
      });
      reply.header('cache-control', 'private, no-store');
      return { data: await calendarSyncState() };
    },
  );
}
