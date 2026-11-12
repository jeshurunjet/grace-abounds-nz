import { describe, expect, it } from 'vitest';
import { defaultPages, defaultSiteSettings } from './content-defaults.ts';
import { pageKeys, pageSchemas, siteSettingsSchema } from './content.ts';

describe('content schemas', () => {
  it('accept the development defaults for every resource', () => {
    expect(siteSettingsSchema.parse(defaultSiteSettings)).toEqual(
      defaultSiteSettings,
    );
    for (const key of pageKeys)
      expect(pageSchemas[key].parse(defaultPages[key])).toEqual(
        defaultPages[key],
      );
  });

  it('reject unknown fields, unsafe links and missing titles', () => {
    expect(
      siteSettingsSchema.safeParse({ ...defaultSiteSettings, extra: 1 })
        .success,
    ).toBe(false);
    expect(
      siteSettingsSchema.safeParse({
        ...defaultSiteSettings,
        social: {
          ...defaultSiteSettings.social,
          facebook: 'javascript:alert(1)',
        },
      }).success,
    ).toBe(false);
    expect(
      pageSchemas.home.safeParse({
        ...defaultPages.home,
        heroImages: ['//evil.example/x.jpg'],
      }).success,
    ).toBe(false);
    // Photo links: https on any website, or a /images/ path; nothing else.
    for (const image of [
      'https://example.com/photo.jpg',
      '/images/church-front.jpg',
    ])
      expect(
        pageSchemas.about.safeParse({ ...defaultPages.about, image }).success,
      ).toBe(true);
    for (const image of [
      'http://example.com/photo.jpg',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '/admin/photo.jpg',
      'https://example.com/a b.jpg',
    ])
      expect(
        pageSchemas.about.safeParse({ ...defaultPages.about, image }).success,
      ).toBe(false);
    expect(
      pageSchemas.events.safeParse({
        hero: { ...defaultPages.events.hero, title: ' ' },
      }).success,
    ).toBe(false);
  });
});
