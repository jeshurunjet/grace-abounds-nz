/**
 * Development only: writes the starting website content to an EMPTY
 * database. Existing rows are never overwritten, and it refuses to run in
 * production (real content is imported deliberately, not seeded).
 *
 *   pnpm --filter @grace-abounds/database content:seed
 */
import {
  defaultLocations,
  defaultNextSteps,
  defaultPages,
  defaultSermons,
  defaultSiteSettings,
  defaultTeam,
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
  // Sermons are never seeded as approved: the ones the prototype showed
  // wait for the Pastor's approval, the rest stay drafts.
  if ((await tx.sermon.count()) === 0) {
    for (const { published, slug, date, ...item } of defaultSermons) {
      const review = published ? ('PENDING' as const) : ('DRAFT' as const);
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
    created.push('sermons (awaiting Pastor approval)');
  }
});
console.log(
  created.length
    ? `Seeded website content: ${created.join(', ')}.`
    : 'Website content already exists; nothing changed.',
);
await prisma.$disconnect();
