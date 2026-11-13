// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cacheMode } from './public-content';
import { PUBLIC_CONTENT_TAG, verifyRevalidation } from './revalidation';

const secret = 'x'.repeat(40);
const sign = (at: number, tags = PUBLIC_CONTENT_TAG, key = secret) =>
  createHmac('sha256', key).update(`${at}.${tags}`).digest('hex');

describe('content revalidation from the API outbox', () => {
  it('accepts only a fresh request signed with the shared secret', () => {
    const now = 1_800_000_000_000;
    const body = { at: now, tags: PUBLIC_CONTENT_TAG, signature: sign(now) };
    expect(verifyRevalidation(body, secret, now)).toBe(true);
    expect(verifyRevalidation(body, 'y'.repeat(40), now)).toBe(false);
    expect(verifyRevalidation(body, secret, now + 6 * 60_000)).toBe(false);
    expect(
      verifyRevalidation(
        { ...body, tags: 'everything', signature: sign(now, 'everything') },
        secret,
        now,
      ),
    ).toBe(false);
    expect(
      verifyRevalidation({ ...body, signature: 'nope' }, secret, now),
    ).toBe(false);
    expect(verifyRevalidation(null, secret, now)).toBe(false);
    // A short or missing secret never verifies.
    expect(
      verifyRevalidation(
        { ...body, signature: sign(now, PUBLIC_CONTENT_TAG, 'short') },
        'short',
        now,
      ),
    ).toBe(false);
  });

  it('keeps the no-store path unless caching is switched on', () => {
    expect(cacheMode(0)).toEqual({ cache: 'no-store' });
    expect(cacheMode(Number.NaN)).toEqual({ cache: 'no-store' });
    expect(cacheMode(120)).toEqual({
      next: { revalidate: 120, tags: [PUBLIC_CONTENT_TAG] },
    });
  });
});
