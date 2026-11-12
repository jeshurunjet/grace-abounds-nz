import { describe, expect, it } from 'vitest';
import {
  classifyLink,
  isOutsideLink,
  nextStepInputSchema,
  resourceInputSchema,
  safeLinkHref,
} from './collections.ts';

/*
 * Codex Phase 2B/Gallery re-review [P1]: one strict link classifier shared
 * by the schemas, the Pastor publication gate and rendered links. A form
 * that a browser would send elsewhere is refused, never called internal.
 */
const slashBackslash = '/\\video.example/watch';

describe('link classification', () => {
  it('refuses forms browsers resolve to another website', () => {
    // The standard URL parser sends this off-site, as a browser would.
    expect(new URL(slashBackslash, 'https://church.example').origin).toBe(
      'https://video.example',
    );
    for (const value of [
      slashBackslash,
      '/\\\\video.example',
      '//video.example/watch',
      '/\tvideo',
      '/\nvideo',
      '/ video',
      'https://video.example\\@church.example',
      'https://user:secret@video.example',
      'https:/video.example',
      'javascript:alert(1)',
      'http://video.example',
      '',
    ]) {
      expect(classifyLink(value), JSON.stringify(value)).toBeNull();
      expect(safeLinkHref(value)).toBeUndefined();
      expect(isOutsideLink(value)).toBe(false);
    }
  });

  it('accepts normal site paths as internal and https links as external', () => {
    for (const value of [
      '/next-steps',
      '/members?join=New%20to%20Faith',
      '/sermons/walking-in-the-spirit#notes',
    ])
      expect(classifyLink(value)).toEqual({ kind: 'internal', href: value });
    expect(classifyLink('https://example.org/files/notes.pdf')).toEqual({
      kind: 'external',
      href: 'https://example.org/files/notes.pdf',
    });
    expect(isOutsideLink('https://example.org/watch')).toBe(true);
    expect(isOutsideLink('/next-steps')).toBe(false);
  });

  it('the resource and Next steps schemas use the same rule', () => {
    const resource = {
      title: 'Guide',
      description: '',
      type: 'PDF',
      folderId: null,
      visibility: 'members',
      status: 'published',
    };
    const bad = resourceInputSchema.safeParse({
      ...resource,
      url: slashBackslash,
    });
    expect(bad.success).toBe(false);
    expect(
      resourceInputSchema.safeParse({ ...resource, url: '/next-steps' })
        .success,
    ).toBe(true);
    const step = {
      title: 'Serve',
      subtitle: '',
      heading: '',
      body: '',
      icon: '',
      path: [],
      status: 'published',
    };
    expect(
      nextStepInputSchema.safeParse({
        ...step,
        cta: { kind: 'link', label: 'Go', target: slashBackslash },
      }).success,
    ).toBe(false);
    expect(
      nextStepInputSchema.safeParse({
        ...step,
        cta: { kind: 'link', label: 'Go', target: '/give' },
      }).success,
    ).toBe(true);
  });
});
