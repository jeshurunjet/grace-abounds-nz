import { describe, expect, it } from 'vitest';
import { canOptimize } from './site-image';

describe('canOptimize', () => {
  it('uses the image server only for site paths and trusted hosts', () => {
    expect(canOptimize('/images/hero-1.jpg')).toBe(true);
    expect(canOptimize('https://images.unsplash.com/photo-1?w=10')).toBe(true);
    // Other websites load directly in the browser, never via our server.
    expect(canOptimize('https://example.com/photo.jpg')).toBe(false);
    expect(canOptimize('https://images.unsplash.com.evil.test/x.jpg')).toBe(
      false,
    );
    expect(canOptimize('//example.com/x.jpg')).toBe(false);
  });
});
