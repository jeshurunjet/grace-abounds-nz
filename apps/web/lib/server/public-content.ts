import type { PublicContentBundle } from '@grace-abounds/validation';

/**
 * Published website content for server rendering, straight from the API on
 * the private network. Returns null if the API is unreachable or content has
 * not been set up; there is no demo-content fallback.
 */
export async function fetchPublicContent(): Promise<PublicContentBundle | null> {
  const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
  try {
    const response = await fetch(`${apiUrl}/v1/public/content`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: PublicContentBundle };
    return body.data ?? null;
  } catch {
    return null;
  }
}
