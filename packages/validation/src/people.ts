import { z } from 'zod';
import type { RetentionHoldItem } from './account.ts';

/*
 * People (Phase 4C): the staff directory of canonical accounts, ordinary
 * member suspend/reactivate, and role summaries with real counts.
 *
 * Both fixed staff accounts (Pastor and Admin) may look up accounts and
 * suspend or reactivate ordinary members. Staff accounts are never changed
 * here; staff provisioning stays an operator task. Directory responses hold
 * account details only: never credentials, care text or care counts for a
 * member, except the Pastor's care counts.
 */

export const accountRoles = ['member', 'admin', 'pastor'] as const;
export type AccountRole = (typeof accountRoles)[number];
export const accountStatuses = [
  'active',
  'suspended',
  'deletion_pending',
] as const;
export type AccountStatusName = (typeof accountStatuses)[number];
export const accountStatusLabels: Record<AccountStatusName, string> = {
  active: 'Active',
  suspended: 'Suspended',
  deletion_pending: 'Deleted',
};
export const accountRoleLabels: Record<AccountRole, string> = {
  member: 'Member',
  admin: 'Admin',
  pastor: 'Pastor',
};

export const PEOPLE_PAGE_SIZE = 50;

/** GET /v1/staff/members query: bounded, server-side search. */
export const peopleQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    status: z.enum(['all', 'active', 'suspended']).default('all'),
    role: z.enum(['all', 'member', 'staff']).default('all'),
    cursor: z.string().trim().max(320).default(''),
    limit: z.coerce.number().int().min(1).max(100).default(PEOPLE_PAGE_SIZE),
  })
  .strict();
export type PeopleQuery = z.infer<typeof peopleQuerySchema>;

/** Suspend or reactivate an ordinary member (If-Match required). */
export const memberStatusInputSchema = z
  .object({ status: z.enum(['active', 'suspended']) })
  .strict();
export type MemberStatusInput = z.infer<typeof memberStatusInputSchema>;

/** One row of the directory. */
export type PersonSummary = {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  status: AccountStatusName;
  /** True only for an ordinary member this staff account may change. */
  manageable: boolean;
  createdAt: string;
  version: number;
};

export type AppointmentCounts = {
  requested: number;
  proposed: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  declined: number;
};
export type PrayerCounts = {
  submitted: number;
  praying: number;
  prayedFor: number;
};

/** One person, with what the viewer's role may see about them. */
export type PersonDetail = PersonSummary & {
  phone: string;
  emailVerified: boolean;
  /** Appointment status counts (logistics, both staff roles). */
  appointments: AppointmentCounts;
  /** Pastor only: prayer status counts. Absent for Admin. */
  prayers?: PrayerCounts;
  /** Active records holds on this person (both staff roles). */
  holds: RetentionHoldItem[];
  /** For a deleted account: when, how, and when the rest is removed. */
  deletion?: {
    via: 'self' | 'staff';
    requestedAt: string;
    purgeAfter: string;
  };
};

export type PeoplePage = { items: PersonSummary[]; nextCursor: string };

/**
 * Home summary for staff. Member counts exclude the fixed staff accounts.
 * Prayer counts are present for the Pastor only; Admin never receives them.
 */
export type StaffSummary = {
  members: { active: number; suspended: number };
  sermons: { published: number; awaitingApproval: number };
  appointments: AppointmentCounts;
  prayers?: PrayerCounts;
};
