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
/** A link: https:// address or a site path such as /next-steps. */
export const isLinkRef = (value: string) =>
  /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:[/?#]\S*)?$/.test(value) ||
  /^\/(?!\/)\S*$/.test(value);
const optionalLink = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value === '' || isLinkRef(value),
    'Use an https:// address or a site path starting with /.',
  );

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
    url: optionalLink,
    folderId: z.string().trim().min(1).max(40).nullable(),
    visibility: z.enum(resourceVisibilities),
    status,
  })
  .strict();

export const folderInputSchema = z
  .object({
    name: required(80, 'a folder name'),
    parentId: z.string().trim().min(1).max(40).nullable(),
  })
  .strict();

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
};
