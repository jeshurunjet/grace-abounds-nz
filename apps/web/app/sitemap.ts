import type { MetadataRoute } from 'next';
import { fetchPublicContent } from '../lib/server/public-content';

/**
 * Public pages plus the published records behind them, all from the
 * database: Pastor-approved sermons and published, live activities.
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
    ...(content?.collections?.activities ?? []).map(
      (item) => `/events/${item.slug}`,
    ),
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
