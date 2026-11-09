import type { MetadataRoute } from 'next';
import { seedContent } from './lib/content';
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.org';
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
    ...seedContent.sermons
      .filter((item) => item.status === 'published')
      .map((item) => `/sermons/${item.slug}`),
  ];
  return paths.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
