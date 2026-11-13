import { createHmac, timingSafeEqual } from 'node:crypto';

/** The cache tag on the public content bundle (see public-content.ts). */
export const PUBLIC_CONTENT_TAG = 'public-content';
const MAX_AGE_MS = 5 * 60_000;

/**
 * Checks a revalidation request from the API's outbox dispatcher: an HMAC of
 * "<at>.<tags>" with the API/web shared secret, no older than five minutes.
 * Only the public-content tag can be revalidated.
 */
export function verifyRevalidation(
  body: unknown,
  secret: string,
  now = Date.now(),
): boolean {
  const { at, tags, signature } = (body ?? {}) as {
    at?: unknown;
    tags?: unknown;
    signature?: unknown;
  };
  if (
    secret.length < 32 ||
    typeof at !== 'number' ||
    tags !== PUBLIC_CONTENT_TAG ||
    typeof signature !== 'string' ||
    !/^[0-9a-f]{64}$/.test(signature) ||
    Math.abs(now - at) > MAX_AGE_MS
  )
    return false;
  const expected = createHmac('sha256', secret)
    .update(`${at}.${tags}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
