import { z } from 'zod';
import { IMAGE_REF_MESSAGE, isImageRef } from './content.ts';

/*
 * Phase 2B editorial collections: campuses, Next steps journeys, leadership
 * and library resources. One input schema per collection, shared by the API
 * (validation) and the website (types). Each record saves on its own.
 */

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, label: string) =>
  z.string().trim().min(1, `Enter ${label}.`).max(max);
/** A photo field may be left empty; otherwise the shared photo rule. */
const optionalImage = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === '' || isImageRef(value), IMAGE_REF_MESSAGE);
/*
 * One link classifier, used by the schemas, the Pastor publication gate and
 * every place the website renders a stored link, so they always agree on
 * where a link really goes. Browsers rewrite backslashes and drop tabs and
 * newlines, so "/\host/x" would leave the site; such ambiguous forms are
 * refused rather than normalised differently at each layer. A site path
 * must resolve, with a standard URL parser, to the site's own origin.
 */
const SITE_ORIGIN = 'https://site.invalid';
export type LinkClass = { kind: 'internal' | 'external'; href: string };
export function classifyLink(value: string): LinkClass | null {
  // Backslashes, whitespace and control characters are never valid here.
  if (
    !value ||
    /[\\\s]/.test(value) ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char === '\x7f')
  )
    return null;
  let url: URL;
  if (value.startsWith('https://')) {
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (
      url.protocol !== 'https:' ||
      !/^[a-z0-9.-]+$/.test(url.hostname) ||
      url.username ||
      url.password
    )
      return null;
    return { kind: 'external', href: value };
  }
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  try {
    url = new URL(value, SITE_ORIGIN);
  } catch {
    return null;
  }
  return url.origin === SITE_ORIGIN ? { kind: 'internal', href: value } : null;
}
/** A link: https:// address or a site path such as /next-steps. */
export const isLinkRef = (value: string) => classifyLink(value) !== null;
/** The link to render, or undefined when it is not a safe destination. */
export const safeLinkHref = (value: string) => classifyLink(value)?.href;
const optionalLink = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value === '' || isLinkRef(value),
    'Use an https:// address or a site path starting with /.',
  );

/** A direct, playable recording: an https:// link to one of these files. */
export const mediaExtensions = ['mp4', 'm4v', 'webm', 'mp3', 'm4a'] as const;
export const isMediaRef = (value: string) =>
  /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/\S*\.(?:mp4|m4v|webm|mp3|m4a)(?:[?#]\S*)?$/i.test(
    value,
  );
/**
 * Links that play as video: recording files and the common video hosts.
 * Library resources may not point at these, so a video can only reach
 * members or the public through a Pastor-approved sermon.
 */
export const isVideoLink = (value: string) =>
  /\.(?:mp4|m4v|webm|mov|mkv|avi|m3u8)(?:[?#]|$)/i.test(value) ||
  /^https:\/\/(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be|vimeo\.com|facebook\.com\/[^\s]*\/videos|fb\.watch)(?:[/:?#]|$)/i.test(
    value,
  );
/*
 * Library publication policy until uploads are verified (Phase 2D). A link's
 * spelling cannot prove it is not a video, so it fails closed:
 * - a site path (/…) or an approved sermon reference publishes normally;
 * - a link to another website (https://…) is published by the Pastor only,
 *   who opens it first. Admin saves it as a draft for the Pastor.
 * Obvious video links are refused for everyone (use Sermons & videos).
 */
export const isOutsideLink = (value: string) =>
  classifyLink(value)?.kind === 'external';
export const PASTOR_LINK_MESSAGE =
  'Only the Pastor can publish a link to another website. Save it as a draft and ask the Pastor to check and publish it.';
export const VIDEO_LINK_MESSAGE =
  'Videos are published through Sermons & videos, where the Pastor approves them.';

export const contentStatuses = ['draft', 'published', 'archived'] as const;
export type ContentStatusValue = (typeof contentStatuses)[number];
const status = z.enum(contentStatuses);

export const locationInputSchema = z
  .object({
    name: required(120, 'a campus name'),
    kind: text(60),
    address: text(200),
    image: optionalImage,
    status,
  })
  .strict();

export const nextStepCtaKinds = [
  'interest',
  'appointment',
  'calendar',
  'link',
] as const;
export const nextStepInputSchema = z
  .object({
    title: required(80, 'a title'),
    subtitle: text(120),
    heading: text(160),
    body: text(2000),
    icon: text(8),
    cta: z
      .object({
        kind: z.enum(nextStepCtaKinds),
        label: required(60, 'a button label'),
        target: text(500),
      })
      .strict()
      .superRefine((cta, context) => {
        if (cta.kind === 'link' && !isLinkRef(cta.target))
          context.addIssue({
            code: 'custom',
            path: ['target'],
            message: 'Use an https:// address or a site path starting with /.',
          });
      }),
    path: z.array(required(200, 'a step')).max(12),
    status,
  })
  .strict();

export const teamMemberInputSchema = z
  .object({
    name: required(120, 'a name'),
    role: text(120),
    bio: text(1000),
    image: optionalImage,
    status,
  })
  .strict();

export const resourceVisibilities = ['public', 'members'] as const;
export const resourceInputSchema = z
  .object({
    title: required(160, 'a title'),
    description: text(600),
    type: text(40),
    url: optionalLink.refine(
      (value) => !isVideoLink(value),
      VIDEO_LINK_MESSAGE,
    ),
    /** An approved sermon shown in the library (instead of a link). */
    sermonId: z.string().trim().min(1).max(40).nullable().default(null),
    folderId: z.string().trim().min(1).max(40).nullable(),
    visibility: z.enum(resourceVisibilities),
    status,
  })
  .strict()
  .superRefine((resource, context) => {
    if (resource.sermonId && resource.url)
      context.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'Choose a sermon or a link, not both.',
      });
  });

export const folderInputSchema = z
  .object({
    name: required(80, 'a folder name'),
    parentId: z.string().trim().min(1).max(40).nullable(),
  })
  .strict();

/*
 * Sermons & videos. Admin and Pastor prepare a sermon and Save it; Save never
 * publishes. Only the Pastor approves an exact saved version for the public
 * site and members, and any later change needs approval again (the approved
 * version stays live meanwhile). The slug is set once, on create.
 */
export const sermonInputSchema = z
  .object({
    title: required(160, 'a title'),
    series: text(120),
    speaker: text(120),
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.')
      .refine(
        (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
        'Choose a date.',
      ),
    duration: text(20),
    image: optionalImage,
    summary: text(2000),
    mediaUrl: z
      .string()
      .trim()
      .max(1000)
      .refine(
        (value) => value === '' || isMediaRef(value),
        'Use an https:// link to an MP4, WebM, MP3 or M4A file.',
      ),
  })
  .strict();
export const sermonReviewStates = [
  'draft',
  'pending',
  'approved',
  'rejected',
] as const;
export type SermonReviewState = (typeof sermonReviewStates)[number];
export const sermonRejectSchema = z
  .object({ note: required(1000, 'a note for the editor') })
  .strict();
export type SermonInput = z.infer<typeof sermonInputSchema>;
/** The public fields of a sermon, as approved by the Pastor. */
export type PublicSermon = SermonInput & { id: string; slug: string };
/** A sermon as staff see it: the working copy plus its review state. */
export type StaffSermon = SermonInput & {
  id: string;
  slug: string;
  review: SermonReviewState;
  reviewNote: string;
  archived: boolean;
  /** The approved version currently live, if any. */
  live: null | {
    version: number;
    approvedAt: string;
    title: string;
    mediaUrl: string;
  };
  /** True when the working copy differs from what is live. */
  changedSinceApproval: boolean;
  /** Ever approved: such a sermon is archived rather than deleted. */
  everApproved: boolean;
  version: number;
  updatedAt: string;
};

export type LocationInput = z.infer<typeof locationInputSchema>;
export type NextStepInput = z.infer<typeof nextStepInputSchema>;
export type TeamMemberInput = z.infer<typeof teamMemberInputSchema>;
export type ResourceInput = z.infer<typeof resourceInputSchema>;
export type FolderInput = z.infer<typeof folderInputSchema>;

/** What staff endpoints return for one record. */
export type StaffRecord<T> = T & {
  id: string;
  position: number;
  version: number;
  updatedAt: string;
};
/** Published records as the public website receives them. */
/** `key` is the stable campus id activities use. */
export type PublicLocation = Omit<LocationInput, 'status'> & {
  id: string;
  key: string;
};
export type PublicNextStep = Omit<NextStepInput, 'status'> & { id: string };
export type PublicTeamMember = Omit<TeamMemberInput, 'status'> & {
  id: string;
};
export type PublicCollections = {
  locations: PublicLocation[];
  steps: PublicNextStep[];
  team: PublicTeamMember[];
  /** Pastor-approved sermons, newest first. */
  sermons?: PublicSermon[];
};
