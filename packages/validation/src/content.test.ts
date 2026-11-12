import { describe, expect, it } from 'vitest';
import { defaultPages, defaultSiteSettings } from './content-defaults.js';
import { pageKeys, pageSchemas, siteSettingsSchema } from './content.js';

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
    expect(
      pageSchemas.events.safeParse({
        hero: { ...defaultPages.events.hero, title: ' ' },
      }).success,
    ).toBe(false);
  });
});
