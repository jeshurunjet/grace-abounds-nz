import type { PublicContentBundle } from '@grace-abounds/validation';
import { PUBLIC_CONTENT_TAG } from './revalidation';

/**
 * No caching unless PUBLIC_CONTENT_CACHE_SECONDS is set (Phase 2C keeps the
 * safe no-store path until caching is verified). When set, the bundle is
 * cached under the public-content tag, which every save or restore clears
 * through the outbox, with the timer as a backstop.
 */
export function cacheMode(
  seconds = Number(process.env.PUBLIC_CONTENT_CACHE_SECONDS ?? 0),
): RequestInit & { next?: { revalidate: number; tags: string[] } } {
  return Number.isFinite(seconds) && seconds > 0
    ? { next: { revalidate: Math.floor(seconds), tags: [PUBLIC_CONTENT_TAG] } }
    : { cache: 'no-store' };
}

/**
 * Published website content for server rendering, straight from the API on
 * the private network. Returns null if the API is unreachable or content has
 * not been set up; there is no demo-content fallback.
 */
export async function fetchPublicContent(): Promise<PublicContentBundle | null> {
  const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
  try {
    const response = await fetch(`${apiUrl}/v1/public/content`, cacheMode());
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: PublicContentBundle };
    return body.data ?? null;
  } catch {
    return null;
  }
}
