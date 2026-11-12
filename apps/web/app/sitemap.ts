import type { MetadataRoute } from 'next';
import { fetchPublicContent } from '../lib/server/public-content';
import { seedContent } from './lib/content';

/**
 * Public pages plus the published records behind them. Sermons come from the
 * database (Pastor-approved only). Activities are still browser-kept until
 * Phase 3, so their published seed records are listed until then.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.org';
  const content = await fetchPublicContent();
  const paths = [
    '',
    '/about',
    '/location',
    '/next-steps',
    '/give',
    '/events',
    '/sermons',
    '/privacy',
    '/terms',
    ...seedContent.activities
      .filter((item) => item.status === 'published')
      .map((item) => `/events/${item.slug}`),
    ...(content?.collections?.sermons ?? []).map(
      (item) => `/sermons/${item.slug}`,
    ),
  ];
  return paths.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
