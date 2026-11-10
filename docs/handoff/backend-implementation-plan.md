# Backend implementation plan — agreed decisions

Agreed with the project owner on 10 November 2026. This file refines
[backend-plan.md](../api/backend-plan.md) and the
[Claude backend brief](claude-backend-brief.md). **Where they differ, this
file wins.** Current status and next steps are in
[backend-progress.md](backend-progress.md).

Planning is still open (see "Open decisions"). Do not start or continue
implementation until the owner confirms the open decisions and says to begin.

## Decisions

### Product and roles

- Exactly three roles: Pastor, Admin, Member. Staff keep member features.
- **Pastor and Admin accounts are fixed.** They are created by an operator
  command (`staff:add`), never through sign-up. Anyone may sign up, always as
  Member. Role changes afterwards only by the Pastor through the API.
- **Website edits publish immediately.** No submit/approve/reject endpoints.
  Keep hidden drafts, archive, activity scheduled releases, revision history
  and audited restore. An approval step is reserved for the future OBS
  automated sermon-video publishing only.
- Activities (services, groups, studies, events, ministries) are one model;
  calendars are projections of it. Next steps interest applications stay
  separate from bookings and memberships.

### Sign-in

- Supported methods, for every role:
  - **Email and password** — retained, including password reset (owner
    decision, 10 Nov). Passwords hashed with Argon2id.
  - **Six-digit email code** — works with any email provider; no Gmail needed.
  - **Google login** — optional for users; available to everyone.
  - **Passkeys** — added from Settings after signing in.
- A Google login may attach to an existing account with the same email only
  when Google reports the email as verified.
- **Session consequence of keeping passwords:** Auth.js password
  (Credentials) sign-in does not work with database sessions. Use Auth.js
  JWT cookie sessions plus a per-user `sessionVersion` stored in the
  database and checked on every request, so suspension, password reset and
  "sign out everywhere" take effect immediately. The API still reloads role
  and status from the database for every call.
- Password reset signs out every other session.
- Rate limits: code/reset requests and wrong guesses are limited per email
  (Phase 1 draft: 5 requests/hour, 5 wrong guesses/15 min, 10-minute codes).
  Responses never reveal whether an email has an account.

### Architecture

- Keep the monorepo: `apps/web` (Next.js + Auth.js), `apps/api` (Fastify),
  `apps/media-worker`, shared `packages/*` (database, types, validation).
  No separate repositories.
- Website ↔ API: same-origin Next.js `/api/v1/*` gateway validates the
  session, blocks cross-site mutations and sends Fastify a 60-second signed
  identity assertion (HS256, audience `grace-api`). Never trust a
  browser-supplied user ID or role.
- PostgreSQL + Prisma; Zod validation on every request; error envelope
  `{ error: { code, message, fieldErrors?, requestId } }`; If-Match versions
  for staff edits; audit events for account and publishing actions.
- Background jobs: pg-boss on PostgreSQL (no extra service).

### Providers and accounts

| Need                                 | Decision                                                                                                                                                                                                                                                                                                                                                                                                                          | Owner status                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Google login + calendar              | Free Google Cloud project under the church's Gmail account                                                                                                                                                                                                                                                                                                                                                                        | Gmail account exists                         |
| Email (codes, resets, notifications) | Resend (free tier: 3,000/month, 100/day), sending from the church's own domain after DNS verification. Local development prints codes in the terminal. Do not send through Gmail.                                                                                                                                                                                                                                                 | Domain owned and paid; no Resend account yet |
| File storage                         | Amazon S3 in the AWS Auckland region, CloudFront in front for video. Code stays S3-compatible so Cloudflare R2 remains an alternative.                                                                                                                                                                                                                                                                                            | Owner happy to pay; set up in Phase 2        |
| Calendar                             | Google Calendar (not Office 365). **A:** one-way sync from the site to a public church Google Calendar through a Google service account; anyone can subscribe (Phase 3b). **B, later:** members who link Google get their own bookings in their personal Google Calendar (needs Google OAuth verification for calendar scopes). Members without Google keep .ics downloads and the public subscription. Two-way sync not planned. | —                                            |
| Hosting                              | Chosen in Phase 6; development/staging on free tiers. Expect roughly NZD 5–20/month for database + API; Vercel Hobby is for non-commercial personal use, so a church may need Pro or Railway/Render.                                                                                                                                                                                                                              | Nothing paid yet                             |
| Payments                             | None. Giving page shows bank details only.                                                                                                                                                                                                                                                                                                                                                                                        | —                                            |
| Optional                             | Google for Nonprofits (free Workspace) if the church is a registered NZ charity.                                                                                                                                                                                                                                                                                                                                                  | —                                            |

## Open decisions (owner to confirm before implementation)

1. At sign-up, is a password **required**, or do people sign up with an email
   code/Google and optionally add a password later in Settings?
2. Password reset by **six-digit emailed code** (matches current screens) or
   by **emailed link**?
3. Revise the existing `backend-phase-1` branch to restore passwords, or
   discard it and start Phase 1 again?

## Phases

| Phase | Scope                                                                                                                                                                                                                                                                                                                                                        | Owner side tasks                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1     | Schema (users, Auth.js tables, passkeys, password hashes, attempt limits, audit); Auth.js with password, email code, Google, passkeys; password reset; `staff:add`; gateway; Fastify identity, permissions, errors, request IDs; `GET/PATCH /v1/me`; Pastor suspend/reactivate; login/sign-up/reset screens wired; demo accounts and secret fallback removed | Google Cloud OAuth client; Docker Desktop; run setup commands; Resend + DNS when ready for real email |
| 2     | Site settings, seven page sections, locations, team, resources, next steps, sermon metadata; revisions/restore; versioned writes; image uploads                                                                                                                                                                                                              | S3 bucket, IAM keys, CloudFront                                                                       |
| 3     | Activities, exceptions, occurrences, memberships, bookings with transactional capacity; rosters; .ics export incl. changed instances                                                                                                                                                                                                                         | —                                                                                                     |
| 3b    | Google Calendar one-way sync (calendar A) + public subscribe link                                                                                                                                                                                                                                                                                            | Create church calendar; service account; share the calendar with it                                   |
| 4     | Conversations, prayer, appointments, interest applications, assignments, protected resources                                                                                                                                                                                                                                                                 | —                                                                                                     |
| 5     | Preferences, notifications, export/deletion, sermon media processing (FFmpeg worker)                                                                                                                                                                                                                                                                         | FFmpeg on worker host                                                                                 |
| 6     | Staging acceptance across roles and mobile; backups; production                                                                                                                                                                                                                                                                                              | Hosting accounts                                                                                      |
| Later | Calendar B (personal Google Calendar for linked members)                                                                                                                                                                                                                                                                                                     | Google OAuth verification                                                                             |

## Working agreement (Claude and Codex)

- One branch per phase (`backend-phase-N`); merge to `main` after review.
- Update `backend-progress.md` at the end of every session: done, next,
  commands to run, open issues.
- Packages are installed on the owner's Mac with `pnpm install` (native
  binaries are macOS builds). Agents write code; the owner runs installs,
  migrations and servers and reports output.
- Give the owner setup commands one at a time with what to expect, never as
  one pasted block, and never overwrite the existing `.env`.
