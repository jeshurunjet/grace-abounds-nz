import { z } from 'zod';

/*
 * Public website content: shared settings and the seven page sections.
 * One schema per resource, shared by the API (validation) and the website
 * (types and adapters). Positional tuples from the old browser store are
 * named fields here.
 */

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, label: string) =>
  z.string().trim().min(1, `Enter ${label}.`).max(max);
/**
 * A photo is a site image path (/images/x.jpg) or an https:// link to a photo
 * on another website. Owner decision (Phase 2): any https link is allowed
 * until uploads (S3 + CloudFront) arrive.
 */
export function isImageRef(value: string): boolean {
  return (
    /^\/images\/\S+$/.test(value) ||
    /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:[/?#]\S*)?$/.test(value)
  );
}
export const IMAGE_REF_MESSAGE =
  'Use an https:// photo link or a site image path starting with /images/.';
const imageRef = z
  .string()
  .trim()
  .max(500)
  .refine(isImageRef, IMAGE_REF_MESSAGE);
const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value === '' || /^https:\/\//.test(value),
    'Use an https:// address.',
  );

export const heroSchema = z
  .object({
    eyebrow: text(120),
    title: required(120, 'a title'),
    accent: text(120),
    copy: text(600),
  })
  .strict();
export const verseSchema = z
  .object({ text: text(400), reference: text(80) })
  .strict();

export const siteSettingsSchema = z
  .object({
    contact: z
      .object({
        email: z.union([
          z.literal(''),
          z.email('Enter a valid email address.').max(254),
        ]),
        phone: text(40),
        address: text(200),
      })
      .strict(),
    footerAddress: text(200),
    social: z
      .object({
        facebook: optionalUrl,
        instagram: optionalUrl,
        youtube: optionalUrl,
      })
      .strict(),
    authVerses: z.array(verseSchema).max(12),
    giving: z
      .object({
        accountName: text(120),
        bank: text(120),
        accountNumber: text(40),
      })
      .strict(),
  })
  .strict();

const introPage = z.object({ hero: heroSchema }).strict();

export const pageSchemas = {
  home: z
    .object({
      hero: heroSchema,
      verse: verseSchema,
      heroImages: z.array(imageRef).max(12),
      gallery: z.array(imageRef).max(24),
    })
    .strict(),
  about: z
    .object({
      intro: text(1200),
      story: text(6000),
      heroImage: z.union([z.literal(''), imageRef]),
      image: z.union([z.literal(''), imageRef]),
      ministryYears: text(20),
      officeHours: text(120),
      values: z
        .array(
          z
            .object({
              number: text(8),
              title: required(80, 'a title'),
              body: text(400),
            })
            .strict(),
        )
        .max(12),
    })
    .strict(),
  location: introPage,
  'next-steps': introPage,
  give: z
    .object({
      hero: heroSchema,
      verse: verseSchema,
      impact: z
        .array(
          z
            .object({
              percent: text(12),
              title: required(80, 'a title'),
              body: text(400),
            })
            .strict(),
        )
        .max(8),
    })
    .strict(),
  events: introPage,
  sermons: introPage,
} as const;

export type PageKey = keyof typeof pageSchemas;
export const pageKeys = Object.keys(pageSchemas) as PageKey[];
export const isPageKey = (value: string): value is PageKey =>
  Object.prototype.hasOwnProperty.call(pageSchemas, value);

export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type PageContentMap = {
  [K in PageKey]: z.infer<(typeof pageSchemas)[K]>;
};
/** What the public website receives: published settings and pages only. */
export type PublicContentBundle = {
  site: SiteSettings;
  pages: PageContentMap;
};
