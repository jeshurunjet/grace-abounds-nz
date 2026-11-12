/**
 * Development only: writes the starting website content to an EMPTY
 * database. Existing rows are never overwritten, and it refuses to run in
 * production (real content is imported deliberately, not seeded).
 *
 *   pnpm --filter @grace-abounds/database content:seed
 */
import {
  defaultPages,
  defaultSiteSettings,
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
});
console.log(
  created.length
    ? `Seeded website content: ${created.join(', ')}.`
    : 'Website content already exists; nothing changed.',
);
await prisma.$disconnect();
