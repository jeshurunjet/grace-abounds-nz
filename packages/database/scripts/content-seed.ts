/**
 * Development only: writes the starting website content to an EMPTY
 * database. Existing rows are never overwritten, and it refuses to run in
 * production (real content is imported deliberately, not seeded).
 *
 *   pnpm --filter @grace-abounds/database content:seed
 */
import {
  defaultActivities,
  defaultActivityExceptions,
  defaultLocations,
  defaultNextSteps,
  defaultPages,
  defaultSermons,
  defaultSiteSettings,
  defaultTeam,
  nzLocalToUtc,
  pageKeys,
} from '@grace-abounds/validation';
import { prisma } from '../src/index.ts';

if (process.env.NODE_ENV === 'production') {
  console.error('content:seed never runs in production.');
  process.exit(1);
}

const created: string[] = [];
await prisma.$transaction(async (tx) => {
  const site = await tx.siteSettings.findUnique({ where: { id: 'site' } });
  if (!site) {
    await tx.siteSettings.create({
      data: { id: 'site', data: defaultSiteSettings },
    });
    await tx.contentRevision.create({
      data: {
        entityType: 'site',
        entityKey: 'site',
        version: 1,
        data: defaultSiteSettings,
      },
    });
    created.push('site');
  }
  for (const key of pageKeys) {
    if (await tx.pageContent.findUnique({ where: { key } })) continue;
    await tx.pageContent.create({ data: { key, data: defaultPages[key] } });
    await tx.contentRevision.create({
      data: {
        entityType: 'page',
        entityKey: key,
        version: 1,
        data: defaultPages[key],
      },
    });
    created.push(key);
  }

  // Phase 2B collections: only when the collection is still empty.
  const status = 'PUBLISHED' as const;
  const revision = (entityType: string, entityKey: string, data: object) =>
    tx.contentRevision.create({
      data: { entityType, entityKey, version: 1, data },
    });
  if ((await tx.location.count()) === 0) {
    for (const [
      position,
      { status: _s, ...item },
    ] of defaultLocations.entries()) {
      void _s;
      const row = await tx.location.create({
        data: { ...item, position, status },
      });
      await revision('locations', row.id, { ...item, status: 'published' });
    }
    created.push('locations');
  }
  if ((await tx.nextStep.count()) === 0) {
    for (const [
      position,
      { status: _s, cta, ...item },
    ] of defaultNextSteps.entries()) {
      void _s;
      const row = await tx.nextStep.create({
        data: {
          ...item,
          ctaKind: cta.kind,
          ctaLabel: cta.label,
          ctaTarget: cta.target,
          position,
          status,
        },
      });
      await revision('next-steps', row.id, {
        ...item,
        cta,
        status: 'published',
      });
    }
    created.push('next steps');
  }
  if ((await tx.teamMember.count()) === 0) {
    for (const [position, { status: _s, ...item }] of defaultTeam.entries()) {
      void _s;
      const row = await tx.teamMember.create({
        data: { ...item, position, status },
      });
      await revision('team', row.id, { ...item, status: 'published' });
    }
    created.push('team');
  }
  // Sermons are seeded as private drafts: they have no recordings, and only
  // the Pastor approves a sermon once a recording is added.
  if ((await tx.sermon.count()) === 0) {
    for (const {
      published: _published,
      slug,
      date,
      ...item
    } of defaultSermons) {
      void _published;
      const review = 'DRAFT' as const;
      const row = await tx.sermon.create({
        data: { ...item, slug, date: new Date(`${date}T00:00:00Z`), review },
      });
      await revision('sermons', row.id, {
        ...item,
        slug,
        date,
        review: review.toLowerCase(),
      });
    }
    created.push('sermons (drafts)');
  }
  // Phase 3A activities: the prototype schedule, only into an empty table.
  // Ids and slugs are kept so occurrence identity (activity + original date)
  // stays stable; a scheduled release time (NZ local) is converted to UTC.
  if ((await tx.activity.count()) === 0) {
    for (const activity of defaultActivities) {
      const { schedule } = activity;
      const [publishDate = '', publishTime = ''] =
        activity.publishAt.split('T');
      const scheduled = activity.status === 'scheduled';
      const row = await tx.activity.create({
        data: {
          id: activity.id,
          slug: activity.slug,
          kind: activity.kind,
          title: activity.title,
          summary: activity.summary,
          leader: activity.leader,
          tag: activity.tag,
          locationKey: activity.locationId,
          venue: activity.venue,
          image: activity.image,
          repeat: schedule.repeat,
          startDate: new Date(`${schedule.date}T00:00:00Z`),
          untilDate: schedule.until
            ? new Date(`${schedule.until}T00:00:00Z`)
            : null,
          days: schedule.days,
          monthWeek: schedule.monthWeek,
          monthDay: schedule.monthDay,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          joinMode: activity.joinMode,
          capacity: activity.joinMode === 'none' ? null : activity.capacity,
          status: scheduled
            ? 'PUBLISHED'
            : (activity.status.toUpperCase() as
                'DRAFT' | 'PUBLISHED' | 'ARCHIVED'),
          publishAt:
            scheduled && publishDate
              ? nzLocalToUtc(publishDate, publishTime)
              : null,
        },
      });
      const exceptions = defaultActivityExceptions.filter(
        (item) => item.activityId === row.id,
      );
      for (const { id: _id, activityId: _a, date, ...item } of exceptions) {
        void _id;
        void _a;
        await tx.activityException.create({
          data: {
            ...item,
            activityId: row.id,
            date: new Date(`${date}T00:00:00Z`),
          },
        });
      }
      await revision('activities', row.id, { ...activity, exceptions });
    }
    created.push('activities');
  }
});
console.log(
  created.length
    ? `Seeded website content: ${created.join(', ')}.`
    : 'Website content already exists; nothing changed.',
);
await prisma.$disconnect();
