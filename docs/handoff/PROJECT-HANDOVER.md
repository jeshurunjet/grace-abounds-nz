# Grace Abounds — Claude ↔ Codex handover

Updated: 10 November 2026 by Claude (Phase 0). **This is the only project handover and backend plan.** Update this file in place; do not create backup handovers, separate progress files or dated reviews. Git preserves history. README files may describe components and link here, but must not duplicate the plan. Earlier handovers have been consolidated and removed.

## How we work

- Owner coordinates the work by pasting instructions into Claude. Claude implements; Codex reviews the resulting diff against this file and the running app. Do not claim that either agent has automatically received a message or reviewed a change.
- Work one phase at a time, with a branch and review checkpoint. Do not merge, push or deploy merely because a phase is coded. Report the branch, commit, changed behavior, checks and remaining blockers here for Codex review.
- Inspect current git status and branch before changing anything; preserve unrelated work. Existing draft branch is `backend-phase-1`. Revise its useful work instead of discarding it blindly. Prefer `codex/` for new Codex branches; do not rename the shared existing branch unnecessarily.
- Preserve the existing frontend and shared workspace. No redesign or new auth/backend framework without a documented reason and owner agreement.
- Follow the existing agreement: the owner runs package installation, migrations and local servers on the Mac. Give commands one at a time with expected results. Agents can inspect source and report checks they can actually run; clearly label everything not run. Never overwrite `.env`, expose credentials, seed production demo users, or reset a real database.
- Provider setup must not block unrelated code. Implement validated configuration and honest unavailable states; never fake successful email, uploads, authentication or delivery.
- At each handoff update the status table, evidence, blockers and exact next instruction at the bottom. Use `not run`, `implemented, unverified`, and `verified` accurately.

## Credit-conscious development

- Keep one implementer (Claude) and use Codex for focused review at phase checkpoints or a specific blocker. No duplicate implementations, unsolicited subagents or repeated whole-repository audits.
- Read this handover once, then inspect only relevant source/diffs. Use targeted searches excluding generated files (`*.tsbuildinfo`, build output, lockfiles unless dependencies change). Keep reports short: changed behavior, checks, blockers, next step.
- Implement the smallest complete slice within each phase. Reuse existing components and dependencies; avoid speculative infrastructure, redesigns and new libraries without a concrete need.
- Run focused checks while working, then the phase acceptance checks once ready. Repeat only after relevant changes/failures. Preserve security, persistence and concurrency tests; conserving credits must not mean skipping launch verification.
- Record exact commands/results here so the next agent does not repeat completed investigation. Defer optional calendar sync and future OBS/subtitle enhancements as already scoped.

## Frontend readiness and operation feedback

The frontend is a viable integration starting point, not a verified complete specification. Phase 0/each feature phase must map every visible action to an endpoint, role/ownership rule, loading/error state and acceptance check. Do this incrementally in this file; fix concrete contract gaps when connecting that feature instead of rebuilding the frontend or starting another general audit. Current local-storage handlers and unavailable account actions need real async results. Preserve input on failure and remove demo-profile fallbacks.

**Toasts already exist:** `apps/web/app/components/toast.tsx` provides success/error/info, dismissal and a polite live region; it is mounted by `providers.tsx` and used in activities, member engagement and staff controls. Reuse it. Toast integration is required in every feature phase, starting with Phase 1; do not postpone operation feedback until Phase 5.

- Success toast only after the server confirms that operation. `202` means queued/request accepted, not delivered, processed or deleted. Use appropriate pending status and durable completion state for jobs.
- Show safe, useful error feedback for network failures, expired sessions, validation, permission denial, stale edits and full bookings. Keep field errors/retry controls inline and persistent; a disappearing toast must not be the only recovery path.
- Avoid success on failed browser writes and duplicate toasts on retries/renders. Use unique IDs (current millisecond IDs can collide), bounded stacking and accessible dismissal; consider error duration and reduced motion when touching this component.
- Toasts are temporary UI feedback. Phase 5 in-app notifications are durable per-user records/read states; emails are separate queued deliveries. Browser push notifications, WebSockets and a new realtime service are not required by this plan.
- Verify server-confirmed success, rejected mutation with no success toast, preserved input/retry and queued-vs-completed wording in focused UI/integration checks.

## Verified starting point

On 10 November, `main` was at `580b20a`; frontend snapshot is `590f1bd`. `backend-phase-1` pointed to `5c22fad` with implementation ancestry including `1d5a147`. These are observations, not permanent branch targets: inspect live git history before starting.

On main, Fastify only serves `/health`, Prisma has no business models, the media worker is a scaffold, and CMS/member data uses browser storage. Only demo credentials authenticate. The draft branch adds users/auth tables, email-code/Google/passkey integration, signed API gateway, current-user/status endpoints and staff bootstrap, but removed password/recovery flows. It was recorded as not installed, migrated or run. It is not approved for merge.

Historical frontend evidence: TypeScript and 30 tests across 11 files passed in the latest focused review. This is not a fresh check, full browser acceptance, or evidence that the backend draft works.

Inspect these before changing contracts: `apps/web/auth.ts`, `app/lib/content.ts`, `page-content.ts`, `activities.ts`, `components/content-provider.tsx`, authentication screens, CMS/activity/sermon editors, member workflows and Settings. Compare source rather than treating old audit defects as still present.

## Product and architecture decisions

- Roles: Pastor, Admin, Member only; staff retain member features. Public registration creates Member only. Bootstrap staff with an audited `staff:add` operator command; later role/account changes are Pastor-only. Protect the final active Pastor in concurrent transactions. Admin directory access is limited and read-only.
- Pastor/Admin CMS edits publish immediately. Preserve hidden drafts, archives, scheduled activity releases, version conflicts, revisions and audited restore. No submit/approve/reject workflow for ordinary website edits.
- Prayer, appointments and confidential notes are owner/Pastor restricted; notes are Pastor-only. Admin CMS access never grants pastoral access. Pastor/Admin can handle member conversations.
- One Activity model for services/groups/studies/events/ministries. Calendars derive from it. Next steps applications are separate from memberships/bookings.
- Keep Next.js + Auth.js, Fastify, Prisma/PostgreSQL, shared validation/types, and the separate media worker. Use pg-boss plus a transactional outbox; S3-compatible storage, initially Amazon S3/CloudFront; Resend for email.
- Next.js validates sessions and proxies `/api/v1/*` to Fastify `/v1/*` with a short-lived signed assertion (HS256, audience `grace-api`, 60-second expiry). Fastify verifies it and reloads account role/status. Enforce mutation origin/CSRF checks and private no-store responses.
- Preserve password, email-code, Google and passkey sign-in. Password hashing: Argon2id. Target JWT cookie sessions with database `sessionVersion` checks on every protected access, including server-rendered routes and the API boundary. Suspension, password reset and sign-out-everywhere revoke effective access immediately. Validate actual installed Auth.js/adapter compatibility, especially passkeys plus JWT, before committing to an implementation. Report incompatibilities with a concrete alternative, never silently remove a login method.
- Google linking requires verified provider email and a documented safe linking policy. Existing-account linking, password changes and passkey registration/removal require appropriate identity proof/recent authentication. Never allow removal of the final usable sign-in method.
- Giving uses bank details only; no payment gateway. Google Calendar public one-way sync is planned; personal sync and two-way sync are not launch dependencies.
- The AUT thesis covers sermon media processing only. OBS ingest, generated subtitles and automated-video approval are future enhancements unless separately requested; ordinary CMS publishing stays immediate.

### Phase 1 defaults — confirmed by owner, 10 November 2026

The owner confirmed all three on 10 November 2026:

1. Email/password signup requires a password and email verification; Google/email-code signup needs no password and can add one later in Settings.
2. Password reset uses a six-digit emailed code, single-use and purpose-bound. Reset revokes all existing sessions and requires fresh sign-in.
3. Revise the existing Phase 1 draft and review the diff before merging.

Baseline code limits: 10-minute expiry, 5 requests/hour per normalized email and 5 wrong guesses/15 minutes; implement atomic limits plus per-IP abuse controls with trusted-proxy configuration, hashed challenges and non-enumerating responses. Tune IP thresholds for shared church networks. No passwords/codes in production logs. Development email codes may print locally only.

## Delivery phases and review gates

Each phase includes migration files, typed contracts, frontend adapters, server permissions, useful failure states, focused integration tests and an update to this handover. A coded phase is not complete until its exit evidence exists. Never report acceptance from screenshots or typechecking alone.

| Phase                        | Deliverable                                                                                                                                                                                                                                                                                                                                                                         | Exit evidence                                                                                                                                                                                                                                                                                      | Owner dependency                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 0 — reconcile                | Inspect draft against main; confirm signup/reset defaults; inventory auth compatibility, CMS fields/actions and environment loading. Preserve the final UI and this handover on the working branch.                                                                                                                                                                                 | Explain chosen session implementation; list draft fixes, missing dependencies and exact setup commands.                                                                                                                                                                                            | Confirm the three defaults above.                                                          |
| 1 — identity and access      | Real verified accounts; password/signup/reset, email code, Google; canonical user/profile IDs; signed gateway; `/me`; Pastor roles/status; audit and bootstrap. Add passkeys after core auth works, but verify or explicitly resolve them before full launch. Settings session list/revoke must reflect actual server state, with durable session records if needed alongside JWTs. | Account survives restart; guessed IDs and forged identity denied; Member/Admin restrictions; immediate suspension/reset revocation; final-Pastor concurrency; atomic challenge/rate limits; real Google callback; real password recovery. No demo-profile fallback or production demo credentials. | Local PostgreSQL/install; Google client. Resend for real email verification.               |
| 2 — CMS and uploads          | All seven public pages/shared content, locations/team/next steps/resources/sermon metadata backed by DB; image/avatar uploads; versioned writes, revision restore, safe preview and cache invalidation. Replace sitemap seed data and example origins.                                                                                                                              | Complete field-to-contract inventory here; two browsers see durable edits after restart; Admin/Pastor publish immediately; stale save rejected; restore audited; drafts/private data excluded; upload bytes/type/size/access verified.                                                             | S3 setup and real church content.                                                          |
| 3 — activities and bookings  | Unified activities, NZ recurrence/exceptions, memberships, transactional bookings, rosters, cancellations, assignments integration and correct .ics downloads.                                                                                                                                                                                                                      | DST gaps/ambiguities and changed occurrences tested; parallel last-place claims produce one winner; duplicate retries safe; schedule/cancellation notices durable; date ranges bounded.                                                                                                            | Confirm actual schedules and capacities.                                                   |
| 3b — public Google calendar  | One-way published activity sync through a service account, stable external IDs, update/cancel/retry and public subscribe link.                                                                                                                                                                                                                                                      | Real create/update/cancel visible in church calendar; retry has no duplicate; private/member data never copied. Can follow launch if clearly labelled unavailable.                                                                                                                                 | Church calendar and narrowly shared service-account access.                                |
| 4 — member workspace         | Conversations, prayer, appointments, applications, assignments, resource downloads and limited staff directory. Finish replacing member browser storage.                                                                                                                                                                                                                            | Two real accounts and both staff roles exercised; Admin cannot retrieve care data; unrelated members denied; requested vs confirmed appointments handled; confidential notes absent from member payloads; protected download expires.                                                              | Owner confirms care access and retention before real records.                              |
| 5 — jobs, accounts and media | Durable email/in-app notifications/preferences; export/deletion; sign-out-everywhere; FFmpeg sermon upload/processing/status/retry/playback. Provider IDs and failure status persist; no completed-state claims for queued work.                                                                                                                                                    | Restart/retry tests without duplicate effects; export ownership/expiry; deletion revocation/retention; real media upload to playable output; failed output cannot publish; bounded worker resources and logs without private bodies.                                                               | Real recordings; storage/email; worker host with FFmpeg.                                   |
| 6 — staging and launch       | Choose hosts, wire CI/deploy migrations, staging and production environments, TLS/domain, monitoring/backups/restore; finish content, SEO/accessibility and role/mobile acceptance.                                                                                                                                                                                                 | Typecheck/tests/lint/build pass; browser matrix and provider flows verified; restore into isolated DB demonstrated; rollback and migration plan reviewed; all remaining limitations explicit; owner approves concrete staging result before production cutover.                                    | Hosting/budget choice, DNS access, approved church/bank/legal content and launch approval. |

Full application launch requires Phases 0–6 except optional 3b. If launching a smaller public-only site first is desired, obtain an explicit scope decision and disable unfinished member features rather than exposing prototypes. Personal Google calendar integration remains later work.

## Owner account setup — when needed

Do not buy or provision all services now. Claude should identify the current dependency and guide the owner one step at a time. Account login, billing and secret entry stay with the owner. Store secrets locally or in hosting secret settings, never in this file/chat or `NEXT_PUBLIC_*`. Record only setup status and non-secret resource identifiers.

### Phase 1: Google sign-in

Use the church-controlled Google account at [Google Cloud Console](https://console.cloud.google.com/). Create/reuse a project; configure Google Auth Platform branding/audience and a Web application OAuth client. Start with sign-in scopes only (openid/email/profile), not Calendar. Configure test users if the app is in testing. Register `http://localhost:3000/api/auth/callback/google` exactly; add the final HTTPS staging/production callbacks when chosen. Put client ID/secret into local `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` only after Claude confirms environment loading. Test with a non-staff account; signup must still create Member. Claude must check publishing/verification requirements for the actual audience/scopes before launch, rather than promise approval is unnecessary.

Official reference: [Google web-server OAuth setup and redirect rules](https://developers.google.com/identity/protocols/oauth2/web-server).

### Phase 1 real email: Resend and domain DNS

Create a church-owned [Resend account](https://resend.com/), add a sending domain/subdomain and copy the precise DNS records Resend supplies into the domain DNS dashboard. Preserve existing email records. Wait for verification, create an appropriately scoped sending key and configure `RESEND_API_KEY` / `EMAIL_FROM` privately. Verify code/reset delivery to actual recipients and sender authentication before accepting real registrations. Development terminal codes are not a live email service. Confirm current plan limits rather than relying on an old price table.

Official reference: [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction).

### Phase 2: Amazon Web Services storage

Use a church-owned [AWS account](https://aws.amazon.com/), with billing contact, root MFA and budget alerts. AWS is separate from website Google login. Do not create root access keys or share the root login. Claude should first prepare the bucket/IAM/CORS/CloudFront plan for review, then guide provisioning in the Auckland region after checking service availability. Keep buckets private with Block Public Access; use narrowly scoped application credentials/roles, signed uploads and authenticated download grants. Public media can be served through CloudFront with restricted origin access; private resources require their own access policy. Separate environments and define lifecycle/backup behavior. Video bandwidth and processing costs need an estimate before production.

Official reference: [AWS root account protection](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html).

### Phase 3b and Phase 6

Public Calendar: create the church calendar, a service account and minimum necessary sharing; add only public events. No personal-calendar OAuth scopes at launch. Hosting: choose a Next.js host, private API, managed PostgreSQL and durable worker capacity after measuring the app. Compare current costs/limits at that time; long-running FFmpeg work must have a suitable worker host. Prepare exact domains, DNS, secret names and migration/rollback instructions before asking for cutover approval. No paid hosting commitment is chosen yet.

## Implementation reference: permissions, data and contracts

The following is the consolidated technical baseline. Routes are planned unless marked verified in the status section. The decisions and phase gates above override any optional/proposed wording below. Implement concrete resource routes and keep an inventory here as contracts become real.

## Permission matrix

| Capability                                                             | Guest | Member | Admin        | Pastor      |
| ---------------------------------------------------------------------- | ----- | ------ | ------------ | ----------- |
| Read published website and live activities                             | Yes   | Yes    | Yes          | Yes         |
| Manage CMS, activities, sermons, public resources                      | No    | No     | Yes          | Yes         |
| Book/join, manage own profile/preferences                              | No    | Own    | Own          | Own         |
| Read member-only resources                                             | No    | Yes    | Yes          | Yes         |
| Read/reply to member conversations                                     | No    | Own    | Staff inbox  | Staff inbox |
| Submit/read own prayer or appointment                                  | No    | Own    | Own          | Own         |
| Manage pastoral requests, notes, assignments and interest applications | No    | No     | No           | Yes         |
| View member directory                                                  | No    | No     | Limited read | Yes         |
| Change roles, suspend/remove accounts                                  | No    | No     | No           | Yes         |
| Read security/publication audit                                        | No    | No     | No           | Yes         |

Guest prayer/contact intake is a proposed separate public form path: rate limited, no public retrieval, and no anonymous account access. Launch it only after confidentiality text, retention and abuse controls are approved. Existing authenticated member requests remain supported regardless.

## Data model

Use stable opaque IDs, foreign keys and timestamps. Add integer versions to editable records. Resolve the prototype's separate auth/profile IDs into a canonical User ID through an explicit import map.

| Entity                                            | Main fields and relationships                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User / Profile                                    | Unique normalized email, role, active/suspended/deletion state; name, avatar asset; one profile per user                                                                              |
| Identity / Session / Credential / Challenge       | Provider subject, session/revocation data, password hash if enabled, passkey public key, expiring single-use verification/reset challenges; follow the selected auth adapter's schema |
| SiteSettings / PageContent                        | Shared church/contact/giving/social settings; seven page keys with versioned, server-validated section JSON                                                                           |
| ContentRevision / AuditEvent                      | Actor, entity, version, before/after or revision reference, timestamp and request ID; restrict sensitive snapshots                                                                    |
| Location / TeamMember / Resource / Asset          | Structured repeatable records, order and visibility; assets store storage key, size/type, owner and access class                                                                      |
| NextStep / InterestApplication                    | Stable opportunity ID and editorial journey content; member interest/status; independent from activity participation                                                                  |
| Sermon / MediaJob                                 | Unique slug, speaker, ISO date, series, summary, visibility, source/output assets; processing status separate from visibility                                                         |
| Activity / ActivityException                      | Existing kind, slug, schedule, campus, venue, join mode, capacity, visibility/release time; unique exception per activity and original local date                                     |
| ActivityOccurrence / Participation                | Occurrence keyed by activity and original local date, cancellation/overrides and capacity lock; participation references member and either occurrence or ongoing membership           |
| Conversation / Message                            | Member conversation, sender from session, body, creation/read metadata; staff access checks                                                                                           |
| PrayerRequest / AppointmentRequest / PastoralNote | Member ownership and status; preferred date is a request, not a confirmed time slot; private notes separately restricted                                                              |
| ServiceAssignment                                 | Member, title, occurrence or local date/time/location; assigned/confirmed/declined                                                                                                    |
| NotificationPreference / Notification / OutboxJob | Per-user preferences, in-app state, delivery attempts, idempotency key and provider result                                                                                            |
| ContactSubmission / ExportJob / DeletionRequest   | Intake and lifecycle records; restricted retention and audited handling                                                                                                               |

Normalize activities, users, participations and locations relationally. Use schema-validated JSON for flexible page sections, not one unrestricted ContentState database blob. Store hero/parallax gallery asset references, alt text, ordering and presentation metadata. Expose each field currently editable in `page-content.ts`/`content.ts`; maintain a field-to-contract inventory during implementation. Replace positional tuples with named fields at the API boundary.

Database constraints must enforce unique slugs, foreign keys, single active participation per member/activity/date and one ongoing membership per member/activity. Use separate constraints for membership versus booking rather than relying on nullable columns in a single uniqueness rule.

## API conventions

Application routes use `/v1`. Lists use bounded `limit` plus opaque `cursor` and return `{ data, nextCursor }`. Detail/mutation responses return `{ data, version }`. Never return the entire private ContentState to a public page or ordinary member.

Use `If-Match` with a record version for staff edits; reject stale writes with `412 VERSION_CONFLICT`. Validate both payload shape and domain rules. Suggested statuses: `201` created, `200` updated, `202` job accepted, `204` removed, `400` malformed, `401` unauthenticated, `403` forbidden, `404` missing/inaccessible private record, `409` capacity/duplicate/state conflict, `422` field validation and `429` rate limit.

Errors have `{ error: { code, message, fieldErrors?, requestId } }`, with no internal stack or confidential content. Use idempotency keys on retried creates such as bookings, messages, uploads and jobs. Scope keys to actor/operation and reject reuse with a different payload. Do not accept actor, role, sender, approval authority or ownership from request bodies.

### Identity and personal account operations

| Operation                            | Proposed route or ownership                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Sign up/sign in/sign out and session | Auth.js handlers plus configured identity adapter                                                        |
| Request/verify six-digit email code  | Same-origin auth challenge handlers; purpose-bound, hashed, expiring, single use, attempt/resend limits  |
| Google login/link/unlink             | Auth.js provider flow; explicit linking with reauthentication, never merge solely on an unverified email |
| Register/use/remove passkey          | Same-origin WebAuthn options/verification handlers; verify challenge, origin and RP ID server-side       |
| Password set/reset                   | Auth handlers with secure hashing, single-use reset token and session revocation                         |
| Current profile                      | `GET /v1/me`, `PATCH /v1/me`                                                                             |
| Preferences                          | `GET/PATCH /v1/me/preferences`                                                                           |
| Sessions                             | `GET /v1/me/sessions`, `DELETE /v1/me/sessions/:id`                                                      |
| Export                               | `POST /v1/me/exports`, `GET /v1/me/exports/:id`                                                          |
| Account deletion request             | `POST /v1/me/deletion-request` with recent authentication                                                |

Code verification must establish the intended verified identity; displaying six boxes is not verification. Prevent account enumeration in challenge/reset responses. Require a viable remaining sign-in method before unlinking Google or removing the final credential. Protect the final active Pastor and require recent authentication for sensitive changes.

### Public website and content management

| Routes                                                                         | Purpose / access                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `GET /v1/public/site`                                                          | Published shared settings; exclude secrets/private support configuration |
| `GET /v1/public/pages/:pageKey`                                                | Home, about, location, next-steps, give, events, sermons section content |
| `GET /v1/public/activities`, `GET /v1/public/activities/:slug`                 | Live activity list/detail, filter by kind/campus/date                    |
| `GET /v1/public/occurrences?from=&to=&locationId=`                             | Bounded date window, includes cancellation/change notes                  |
| `GET /v1/public/sermons`, `GET /v1/public/sermons/:slug`                       | Published, playable sermons                                              |
| `GET /v1/public/team`, `GET /v1/public/locations`, `GET /v1/public/next-steps` | Published structured collections                                         |
| `POST /v1/public/contact`, `POST /v1/public/prayer-requests`                   | Proposed guest intake; restricted staff handling                         |
| `GET/PATCH /v1/staff/site`, `GET/PATCH /v1/staff/pages/:pageKey`               | Staff read/write; exact versions, validated sections                     |
| `GET/POST /v1/staff/{locations,team,resources,next-steps,sermons}`             | Staff collections                                                        |
| `GET/PATCH/DELETE /v1/staff/{collection}/:id`                                  | Staff detail/update/archive; reject deletion of referenced campuses      |
| `GET /v1/staff/revisions?entityType=&entityId=`                                | Staff content history                                                    |
| `POST /v1/staff/revisions/:id/restore`                                         | New audited revision, version check; immediately live if published       |

`{collection}` above is documentation shorthand for explicitly implemented routes, not an arbitrary database-table endpoint. Return dependency conflicts before removing referenced records. Archive live records by default; permanent purge belongs to controlled retention jobs.

Saving a change to published content updates the live version immediately. A save transaction writes the content revision and audit event, then enqueues cache invalidation through an outbox. A draft remains hidden until staff set it published. Do not add submit/approve/reject endpoints. Provide rollback by restoring a prior revision as a new change.

### Activities, calendar and member participation

| Routes                                                            | Purpose / access                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET/POST /v1/staff/activities`                                   | Staff list/create                                                                |
| `GET/PATCH/DELETE /v1/staff/activities/:id`                       | Staff edit/archive                                                               |
| `PUT/DELETE /v1/staff/activities/:id/exceptions/:date`            | Change/cancel one original local date; remove override                           |
| `GET /v1/staff/activities/:id/participants?date=`                 | Authorized staff roster                                                          |
| `DELETE /v1/staff/activities/:id/participations/:participationId` | Audited roster removal                                                           |
| `GET/POST /v1/me/participations`                                  | Own list/join/book; POST accepts activityId and original local date for bookings |
| `DELETE /v1/me/participations/:id`                                | Own cancellation/leave                                                           |
| `GET /v1/me/calendar?from=&to=`                                   | Own bookings, memberships and assignments                                        |
| `GET /v1/public/activities/:slug/calendar.ics?date=`              | Public activity single-date/series export                                        |

Keep recurring schedules as local date/time plus `Pacific/Auckland`; store release/job instants in UTC after explicit timezone conversion. Generate occurrences using one tested recurrence implementation. Keep original occurrence identity stable when its time/place changes. Validate real calendar dates, daylight-saving gaps/ambiguities, allowed weekdays, end time and repeat bounds. Never guess UTC offsets.

For booking, lock a durable occurrence row inside a transaction, verify live/open state and cancellation, check existing active participation and capacity, then insert. Ongoing memberships lock the activity capacity instead. Duplicate retries return the existing result; concurrent last-place requests cannot both succeed. Reject capacity reductions below current participation unless staff explicitly resolve the roster. Schedule changes must identify affected bookings, preserve cancellation history and enqueue notices.

Scheduled public visibility must be checked in server reads (`publishAt <= now`) even if a job is delayed. Release jobs invalidate public caches; cap cache lifetime so jobs alone do not determine visibility. Calendar exports must include cancellation exclusions and modified recurrence instances, with stable UID/sequence data. Calendar export is required for launch. Google public-calendar one-way sync is Phase 3b; personal Google sync is later work. Two-way sync is outside scope.

### Member communication, care and resources

| Routes                                                                            | Purpose / access                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `GET/POST /v1/me/conversations`, `GET/POST /v1/me/conversations/:id/messages`     | Own member/staff conversation                           |
| `GET /v1/staff/conversations`, `GET/POST /v1/staff/conversations/:id/messages`    | Pastor/Admin inbox/replies                              |
| `GET/POST /v1/me/prayer-requests`, `GET /v1/me/prayer-requests/:id`               | Member-owned prayer intake/history                      |
| `GET/POST /v1/me/appointments`, `GET /v1/me/appointments/:id`                     | Member-owned requests                                   |
| `GET/POST /v1/me/interest-applications`                                           | Next steps interest, not a booking                      |
| `GET /v1/me/assignments`, `PATCH /v1/me/assignments/:id/response`                 | Own assignment confirmation/decline                     |
| `GET /v1/pastor/{prayer-requests,appointments,interest-applications,assignments}` | Pastor care lists                                       |
| `PATCH /v1/pastor/{prayer-requests,appointments,interest-applications}/:id`       | Pastor status/handling                                  |
| `POST/PATCH /v1/pastor/assignments[/:id]`                                         | Explicit create and update routes                       |
| `POST /v1/pastor/appointments/:id/notes`                                          | Confidential pastor note                                |
| `GET /v1/me/resources`, `POST /v1/me/resources/:id/download`                      | Authorized resource list and short-lived download grant |
| `GET /v1/me/notifications`, `PATCH /v1/me/notifications/:id`                      | Own inbox/read state                                    |
| `GET /v1/staff/contact-submissions`, `PATCH /v1/staff/contact-submissions/:id`    | Staff contact inbox/status                              |

Appointment confirmation records an agreed time separately from the requested date and checks conflicts. Private notes never appear in member responses. Notification/email messages should direct users to sign in rather than include prayer/message bodies.

### Member administration and media

| Routes                                                                | Purpose / access                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /v1/staff/members`, `GET /v1/staff/members/:id`                  | Limited directory DTO for Admin; Pastor detail can include authorized management fields |
| `PATCH /v1/pastor/members/:id/role`                                   | Pastor role change; enforce final-Pastor/self-lockout rules                             |
| `PATCH /v1/pastor/members/:id/status`                                 | Suspend/reactivate; revoke effective sessions/access                                    |
| `POST /v1/pastor/members/:id/deletion-request`                        | Audited account deletion workflow                                                       |
| `GET /v1/pastor/audit-events`                                         | Restricted, paginated audit                                                             |
| `POST /v1/uploads`, `POST /v1/uploads/:id/complete`                   | Authorized upload grant and server verification                                         |
| `POST /v1/staff/sermons/:id/processing-jobs`                          | Queue processing; `202` means accepted, not completed                                   |
| `GET /v1/staff/media-jobs/:id`, `POST /v1/staff/media-jobs/:id/retry` | Status/retry with idempotency and bounded attempts                                      |

Uploads declare purpose, size and allowed type; verify stored bytes before marking ready. Keep source media/private resources outside public access. Worker jobs use bounded resources and safe FFmpeg arguments, produce durable progress/results, and cannot publish failed or incomplete assets. No arbitrary server-side fetch of user URLs. Export/download grants expire and are ownership checked; account deletion revokes sessions and follows an agreed retention policy rather than silently deleting all audit/history records.

## Jobs, operations and deployment

Use a durable queue with retries, backoff, failure inspection and deduplication. A database outbox bridges committed writes and delivery/cache/media jobs; avoid “database saved, email lost” dual-write gaps. Lightweight notification/export/release jobs can have a general worker, while CPU-intensive media work stays in `apps/media-worker`.

Configure separate development, staging and production databases, buckets and secrets. Required secret/config categories include database connection, session/assertion signing, web/API origins, Google credentials, email sender/provider, storage bucket/access, WebAuthn RP ID/origin and queue connection. Introduce actual variable names alongside implementation; do not imply current `.env.example` configures providers that do not exist.

Add readiness/liveness checks, migration deployment, verified backups/restores, job monitoring and structured request logs. Exclude credentials and private message/prayer bodies from logs. Public-content caching must invalidate on edits/restore and release; private responses use no-store. Define retention with the owner before collection starts, especially for prayer requests, care notes, exports and deleted accounts.

## Migration and frontend connection

1. Inventory every current CMS field/action against its proposed resource; include all seven pages, parallax gallery, hero imagery, about/team, locations, giving, next steps, calendar and sermons.
2. Create schema/migrations and explicit seed/import scripts. Seeds run only for an empty development database or deliberate import; application startup must never overwrite stored content.
3. Offer a reviewed import for browser content-v3/content-v4 where needed. Map locations, demo profile/user IDs and legacy opportunities; validate and report conflicts. Do not automatically import demo identities or private browser data into production.
4. Replace ContentProvider's storage implementation with typed query/mutation adapters, feature by feature. Never send a whole mixed public/private state object. Remove production seed-user fallback behavior.
5. Invalidate/refetch only affected data after confirmed writes. Preserve forms on failure; surface version/capacity conflicts. Do not keep local storage as a competing production source of truth.

## Launch acceptance checklist

- [ ] No production demo authentication, secret fallback, seeded identity/profile substitution or competing browser data store.
- [ ] Seven public pages and details, all CMS fields, every advertised member action and each role checked against real APIs.
- [ ] Public sitemap/canonical URL/robots use the actual site and published records; private pages stay private.
- [ ] Real Google, email, password recovery, passkeys (or owner-approved deferral) and account revocation verified.
- [ ] Upload, download, media processing and notifications verified across worker restarts and failures.
- [ ] Permissions, confidentiality, stale writes, DST, booking concurrency and retries covered by meaningful tests.
- [ ] Church/contact/bank/social/legal details approved; retention and deletion behavior agreed before real confidential data.
- [ ] Separate environment secrets/data; deployment migrations, restore exercise, monitoring, rollback and operational owner documented here.
- [ ] Owner has reviewed staging and approved production cutover.

## Live status — update in place after every session

| Phase | Status                                                                                    | Evidence / blocker                                                                                                                                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Complete — accepted by Codex                                                              | Source review, defaults confirmed, session design below.                                                                                                                                                                                                                         |
| 1     | Codex final finding fixed (`ca0a20b`); all checks re-run; awaiting final Codex checkpoint | `backend-phase-1`. Credential writes checked at persistence. 77 PostgreSQL tests, 40 unit tests, ESLint, full Prettier check and build pass; owner browser re-check of Google sign-up/linking and passkey registration passed (12 Nov). Real Google and Resend accepted earlier. |
| 2–6   | Not implemented                                                                           | Main remains a frontend prototype.                                                                                                                                                                                                                                               |

**How to read this section:** the sections below are a chronological record. Blockers, "pending", "not run" and next-instruction lines inside earlier sections are **historical**. The current state is the table above, and the current next instructions are only in the **last section** of this file.

### Phase 0 reconciliation — Claude, 10 November 2026

**Git:** Working branch `backend-phase-1`. Lineage: `590f1bd` (frontend snapshot) → `1d5a147` (draft Phase 1 code) → `5c22fad` (docs; same content as main's `580b20a`) → `544af29` (this consolidated handover and README links, carried from uncommitted work on main). Local `main` is clean at `580b20a`. Local `main` is 6 commits ahead of `origin/main`. Nothing pushed. A safety copy of the carried docs remains in `git stash` (`phase0: consolidated handover from main`) until Codex confirms it can be dropped.

**Installed versions (from the Mac's `node_modules`; draft dependencies are not installed):** next 15.5.23, next-auth 5.0.0-beta.32 with @auth/core 0.41.3, fastify 5.11.3, prisma/@prisma/client 6.19.3. Not installed: `@auth/prisma-adapter`, `@simplewebauthn/browser@9.0.1`, `@simplewebauthn/server@9.0.3`, `jose`, `zod`, `dotenv-cli`. The draft commit did not update `pnpm-lock.yaml`. `.env` exists with the `.env.example` keys (values not read). No Prisma migrations directory exists yet.

**Auth.js compatibility, from the installed @auth/core 0.41.3 source (`lib/utils/assert.js`, `lib/actions/callback/index.js`):**

- Passkeys (WebAuthn provider) require `experimental.enableWebAuthn` and an adapter with authenticator methods. They do not require database sessions, because the WebAuthn callback issues a JWT cookie when the JWT strategy is in use. Peer requirement: `@simplewebauthn/server ^9.0.2` / `browser ^9.0.1`, which matches the draft's pins. The provider is still experimental upstream, so it stays a launch-verification item.
- The Credentials (password) provider never creates database sessions. The draft's `strategy: 'database'` therefore cannot support password sign-in, which is a concrete reason to switch to JWT.

**Chosen session design (implementation, unverified):** Auth.js `session.strategy: 'jwt'`, keeping PrismaAdapter for users, accounts, verification tokens and authenticators. Add `User.sessionVersion`, `User.passwordHash` (Argon2id via `@node-rs/argon2`, which ships prebuilt binaries and needs no node-gyp), and a durable `UserSession` record (id, user, created/last-seen, coarse device label, expiry, `revokedAt`). The JWT carries `sid` and `sv`. The Auth.js `jwt` callback runs in the Node runtime on every `auth()` call (server-rendered pages and the `/api/v1` gateway). There it reloads status, `sessionVersion` and `UserSession.revokedAt` and ends the session when any check fails. The gateway assertion carries `sub`, `sid` and `sv`, and Fastify repeats the same checks. Suspension, password reset and sign-out-everywhere increment `sessionVersion` and/or revoke rows, so effect is immediate on the next request. Settings session list/revoke reads `UserSession`. Edge middleware, if any, only checks cookie presence.

**Draft fixes required in Phase 1:**

1. Restore password signup (password plus emailed six-digit verification), password sign-in (Credentials), and forgot/reset (six-digit code, revokes all sessions). The draft redirects `/forgot-password` and `/reset-password` to `/login` and deleted `recovery-form.tsx`. Use a purpose-bound `AuthChallenge` table (purpose, normalized email, code hash, expiry, attempts, consumedAt) for verify-email and reset. Auth.js `VerificationToken` stays for email-code sign-in.
2. Switch to JWT plus revocation as above. Session list/revoke and sign-out-everywhere must use real records.
3. Remove `allowDangerousEmailAccountLinking`. **Proposed linking policy:** Google sign-in creates a Member only for a new verified email. If an account already exists for that email without Google linked, refuse and say "sign in your usual way, then link Google in Settings". Linking happens only while signed in, with recent authentication. Staff created by `staff:add` sign in first with an email code. Unlink requires another usable sign-in method.
4. Remove the `legacyProfileIds` demo mapping and the dev `AUTH_SECRET` fallback (require it in every environment). Make `trustHost` configuration-driven.
5. Make rate limits atomic. `consumeAttempt` currently reads and then writes inside a read-committed transaction, so concurrent requests can both pass and a concurrent first insert can throw. Replace it with one `INSERT … ON CONFLICT … RETURNING` statement. Add per-IP limits with a `TRUSTED_PROXY_HOPS` setting, and tune the thresholds for shared church networks.
6. Final-Pastor protection: both the suspend route and `staff:add` count Pastors without a lock, so concurrent demote/suspend of two Pastors can both succeed. Serialize with `pg_advisory_xact_lock` (or `SELECT … FOR UPDATE` on active Pastor rows) in one transaction. Add the missing Pastor-only `PATCH /v1/pastor/members/:id/role` route.
7. Gateway: compare `Origin` against configured `AUTH_URL`/site origin rather than the request host, handle `Origin: null` without a 500, and cap the forwarded body size.
8. Passkey registration and removal: wrap the Auth.js passkey register POST with a recent-authentication check. Block removal of the final usable sign-in method. Add after core auth works, before full launch.
9. Toasts and async results for all auth/Settings actions (reuse `toast.tsx`; success only after server confirmation; preserve input on failure).
10. Generate the first migration and add focused tests: forged or expired assertion, guessed IDs, suspended or revoked session, final-Pastor concurrency, atomic limits, code single-use and expiry, reset revokes sessions, non-enumerating responses.

**Environment loading:** web loads the repo-root `.env` in `next.config.ts` via `process.loadEnvFile`, which needs Node ≥ 20.12. API and database scripts use `dotenv -e ../../.env`. Phase 1 will add (names only): `AUTH_URL`, `AUTH_TRUST_HOST`, `TRUSTED_PROXY_HOPS`. The owner adds them to `.env` by hand when asked; agents never overwrite `.env`.

**Owner setup sequence (one command at a time, once the Phase 1 package changes are committed):** check `node -v` / `pnpm -v` / `docker --version` → `docker compose up -d` → `pnpm install` → `pnpm --filter @grace-abounds/database migrate` (creates the first migration) → seed only an empty dev DB → `pnpm dev`. Google and Resend setup come after local email-code sign-in works.

### Codex Phase 0 checkpoint — 10 November 2026

**Verdict:** Phase 0 source review accepted; proceed to Phase 1 implementation using the confirmed defaults. This is approval of the implementation direction, not working-backend acceptance. No packages installed or runtime checks performed by Codex.

**Evidence:** Installed `@auth/core 0.41.3` callback source has JWT paths for Credentials and WebAuthn; session source invokes `callbacks.jwt` on session reads. The existing API only checks account status and must add session ID/version/revocation/expiry checks. Source also confirms the draft limiter uses a read-then-update transaction. The durable `UserSession` plus JWT design is suitable, subject to integration tests.

**Google recommendation:** Accept explicit linking from Settings after recent authentication; refuse email-match auto-linking. The owner accepted this policy on 10 November 2026. Implement the conservative behavior (no automatic linking) and test signed-in linking separately: Auth.js may link accounts during its OAuth callback, so enforce recent authentication and intended linking there, not only on the Settings button. Google-only existing accounts continue signing in by their already linked provider identity. Staff bootstrap uses email-code sign-in first. Use helpful collision guidance without exposing private account details.

**Required implementation details:**

- Create `UserSession` only after successful authentication; check that `sid` belongs to `sub`, its expiry/revocation and current `sessionVersion` at both boundaries. Never recreate a revoked session in a later JWT callback. Fail closed if validation cannot run. Sign-out revokes the current row. Keep authoritative expiry aligned with cookie lifetime and throttle last-seen writes.
- Recent authentication needs a server-recorded proof time and an actual reauthentication operation. Ordinary session refresh must not advance it; linking/passkey/password actions must enforce it server-side.
- Prevent signup pre-hijacking: verifying an email must not activate a password submitted by an earlier unverified requester. Bind password enrollment to the same verified signup transaction/challenge; reset/replace pending enrollment safely. Challenge consumption and password/session changes are atomic; reset and email-login challenges cannot be interchanged.
- Test failed-password throttling as well as email-code/reset limits; keep password responses non-enumerating and rate-limit Argon2 work. Six-digit challenge hashes must resist offline enumeration (for example, keyed HMAC with a separate server secret); do not log proofs.
- Apply the same final-Pastor serialization protocol to every role/status/deletion/operator mutation that can reduce active Pastor count. A shared advisory lock is clearer than assuming an arbitrary row lock protects a changing set.
- Commit the generated initial migration and updated lockfile before Phase 1 review. The owner can run generation/install commands as agreed, but these artifacts must return to the branch. Run schema generation before typecheck; record the exact command used. Do not leave the first migration as a deployment-time invention.

**Next checkpoint:** Review Phase 1 diff and evidence once implemented. No repeated Phase 0 audit needed. Keep the documentation safety stash for now; it need not block development and should only be removed after its contents are compared with committed docs.

### Codex Phase 1 preliminary source checkpoint — 10 November 2026

Reviewed commit `53ee7de` on `backend-phase-1`. Implementation exists but is **unverified**, not accepted as complete. No install, migration, typecheck or tests run by Codex. Initial migration and updated lockfile are still missing. The handover's earlier Phase 0 status/instructions were not updated by that implementation commit and must be refreshed after setup.

Focused findings to return to Claude while setup proceeds:

1. `apps/web/lib/server/challenges.ts`: concurrent `issueChallenge` transactions can both invalidate the old set and then each create an outstanding code. Serialize issuance/consumption per normalized email and purpose (including the empty-set case), and ensure a consumed code cannot reveal an older still-live code. Add a concurrent resend test proving only the intended latest challenge remains usable. Keep the existing single-use tests.
2. `apps/web/lib/server/http.ts`: `accountRoute` reads the entire body with `request.text()` before enforcing a 16,384-character limit. This is not a bounded byte read. Enforce an actual byte limit while streaming (with appropriate content-length rejection as an early check); use the same bounded helper for the gateway. Add oversized/chunked-body checks.
3. The claimed Google/passkey guards need route-level verification, not just helper tests: signed-out registration denied, signed-in linking without intent/recent proof denied, mismatched/revoked intent denied and intended linking successful. Verify these with real provider/browser acceptance before sign-off. Verify JWT initial sign-in and subsequent reads with every login method.

Setup can proceed with version checks and dependency installation; these findings do not require another planning phase. Claude should fix concrete findings before Phase 1 acceptance and commit migration/lockfile plus exact test evidence. Database security tests use `pnpm test:db` and a dedicated disposable `_test` database; ordinary `pnpm test` skips them and must not be reported as their acceptance. Do not point destructive reset helpers at the development or production database.

**Next action (historical, 10 Nov):** owner runs `node -v && pnpm -v && docker --version` and shares version output with Claude; Claude guides the remaining setup one command at a time, addresses findings above, updates live status here, and returns the verified Phase 1 diff for focused Codex review. No merge, push or deployment yet.

### Phase 1 implementation — Claude, 10 November 2026

_Historical record of the first implementation pass (10–11 Nov). "Not run"/"pending" items here were completed later; see the sections that follow._

**Commits on `backend-phase-1` (none pushed):** `53ee7de` implementation · `c750922` Codex preliminary notes · `df3ef8d` owner-generated migration `20261110044618_phase1_identity` + `pnpm-lock.yaml` + test-helper move · `43c1cb5` Codex findings 1–3 · `3949f34` passkey body limit (the 43c1cb5 edit had not applied; caught by test) + acting-Pastor re-check inside the lock.

**Changed behavior**

- Auth.js `jwt` strategy. Every successful authentication creates a `UserSession` row (`sid`); the JWT carries `sid`/`sv`. The `jwt` callback reloads the row on every `auth()` call (pages, gateway, `useSession`) and returns null when it is revoked, expired, owned by someone else, the `sessionVersion` changed or the account is not active. DB errors fail closed. Fastify repeats the same check from the gateway assertion (`sub`, `sid`, `sv`, 60 s, `maxTokenAge`). `lastSeenAt` writes are throttled to 5 min. Sign-out revokes the row; a revoked row is never recreated.
- Passwords: Argon2id (`@node-rs/argon2`, m=19 MiB, t=2, p=1). Password sign-up stores the password hash on the `SIGNUP_VERIFY` challenge only; the account is created in the transaction that consumes that exact challenge (pre-hijack safe). Sign-in throttled per email (5/15 min) and per IP (50/15 min) before any hashing, dummy-hash timing equaliser, generic failures. Reset: six-digit code, sets password, increments `sessionVersion`, revokes all rows, single use. Settings password add/change needs recent auth and revokes other sessions.
- Challenges (`AuthChallenge`): purpose-bound (`SIGNUP_VERIFY`, `PASSWORD_RESET`, `REAUTH`; email sign-in stays in Auth.js `VerificationToken`), HMAC-SHA256 with `AUTH_CHALLENGE_SECRET`, 10-minute expiry, voided after 5 wrong guesses, issuing and checking serialized per purpose+email with an advisory lock; only the newest challenge is ever usable. Rate limits are one atomic `INSERT … ON CONFLICT … RETURNING` statement, per email and per IP (`TRUSTED_PROXY_HOPS`; IP limits set higher for shared church Wi-Fi). Responses for sign-up/reset/code requests are identical whether or not the account exists.
- Recent authentication: `UserSession.authenticatedAt` moves only on sign-in or `POST /api/account/reauth` (password or emailed code); 10-minute window, enforced server-side in Next (`requireRecentAuth`) and Fastify (`requireRecentAuth`).
- Google: no email-match linking (`allowDangerousEmailAccountLinking` removed). The signIn callback creates a Member only for a new verified email, signs in an already linked account, and otherwise redirects with `OAuthAccountNotLinked`. Linking requires `POST /api/account/intent {kind:'google'}` (recent auth) which sets a signed 10-minute cookie bound to `sid`; the `/callback/google` route guard refuses a signed-in browser without a valid intent for its current, recently authenticated session. Linking keeps the current session.
- Passkeys: registration requires a signed-in, recently authenticated session plus a `passkey` intent (guards on `webauthn-options` and the passkey callback). Signed-out registration (which Auth.js would otherwise turn into a new account) is refused. Removal and Google unlink require recent auth and keep at least one sign-in method (verified email always allows email-code sign-in).
- Pastor routes: `PATCH /v1/pastor/members/:id/status` and new `PATCH /v1/pastor/members/:id/role`, both Pastor-only with `If-Match`, self-change refused, `pg_advisory_xact_lock` shared with `staff:add`, actor re-verified inside the lock, final-Pastor assertion; suspension increments `sessionVersion` and revokes rows; all audited.
- Gateway and account routes: Origin must equal `AUTH_URL` origin (`null`/missing refused); bodies read with `readBodyLimited` (byte count while streaming, early Content-Length rejection): 16 KiB account/passkey, 1 MiB gateway; private `no-store`.
- Frontend: login (email code, Google when configured, passkey, "Use a password instead" + "Forgot password?"), sign-up (name/email/password, or passwordless email code, or Google), real forgot/reset pages, Settings security (password, Google connect/disconnect, passkeys list/add/remove, signed-in devices with per-device and "sign out all others", re-auth modal), own profile via `GET/PATCH /v1/me` (name/phone/bio, version conflicts shown), canonical profile id = user id, demo-profile fallback, demo avatars and dev `AUTH_SECRET` fallback removed. Toasts: counter ids, max 4, errors 8 s; success only after server confirmation. Profile photo stays preview-only (Phase 2); notification preferences, export and deletion stay labelled unavailable (Phase 5); viewing other members' profiles waits for the Phase 4 directory.

**Phase 1 action → contract inventory**

| Visible action                       | Endpoint                                                                                  | Access             | Failure/pending handling                                                                                    | Evidence                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Email me a code / verify             | Auth.js `email-code` + guarded `GET /api/auth/callback/email-code`                        | Guest              | Notice only after accepted; inline error keeps email; TooManyAttempts voids codes                           | forms.test, auth-guards.test                                                                       |
| Password sign-in                     | Auth.js `password` (Credentials)                                                          | Guest              | Generic error / rate-limited message; input kept                                                            | forms.test, account.test                                                                           |
| Password sign-up + verify            | `POST /api/account/signup`, `/signup/verify`                                              | Guest              | 202 → code step; inline errors; success toast after 201                                                     | forms.test, account.test                                                                           |
| Forgot / reset password              | `POST /api/account/password-reset`, `/confirm`                                            | Guest              | Field errors inline; redirect `/login?reset=1` after 200                                                    | account.test                                                                                       |
| Confirm it's you                     | `POST /api/account/reauth`                                                                | Signed in          | Inline error in modal; resumes the pending action                                                           | password-race (proof replaced mid-verification refused), API recent-auth test; browser walkthrough |
| Add/change password                  | `POST /api/account/password`                                                              | Signed in + recent | REAUTH_REQUIRED reopens modal; inline error; commits only if the session is still valid under the user lock | password-race (paused hash vs reset/revocation); browser walkthrough                               |
| Connect / disconnect Google          | `POST /api/account/intent`, Auth.js Google, `DELETE /v1/me/google`                        | Signed in + recent | Result toast only after `/v1/me/security` confirms                                                          | auth-guards, jwt-session, API tests; real callback pending                                         |
| Add / remove passkey                 | `POST /api/account/intent`, Auth.js WebAuthn, `DELETE /v1/me/passkeys/:id`                | Signed in + recent | Success toast only if the refreshed list grew                                                               | auth-guards (linking context recorded), jwt-session (fail closed); Touch ID walkthrough            |
| Devices list / sign out one / others | `GET /v1/me/sessions`, `DELETE /v1/me/sessions/:id`, `POST /v1/me/sessions/revoke-others` | Own                | Toasts on confirmed result; retry on load failure                                                           | API tests; two-browser walkthrough                                                                 |
| Edit profile                         | `GET/PATCH /v1/me` (`If-Match`)                                                           | Own                | VERSION_CONFLICT message + Reload; field errors                                                             | API test (`/v1/me`); browser walkthrough (saved and persisted)                                     |
| Suspend / change role                | `PATCH /v1/pastor/members/:id/status`, `PATCH /v1/pastor/members/:id/role`                | Pastor             | 403/409/412 envelopes                                                                                       | API tests (UI wiring is Phase 4 directory)                                                         |

Route deviations from the planned table: sign-out-others is `POST /v1/me/sessions/revoke-others`; `GET /v1/me/security` added; status route now requires `If-Match`.

**Checks actually run**

- Typecheck (Claude, in the linked VM with the Mac's `node_modules`, TypeScript 5.9.3): `tsc --noEmit -p .` in `packages/database`, `apps/api`, `apps/web` — no errors (after Prisma generate from the new schema).
- Prettier `--check` on all changed files — clean.
- Owner, Mac: `pnpm test` — 12 files, 40 passed, 49 DB tests skipped (as designed).
- Owner, Mac: `docker compose exec postgres createdb -U grace_abounds grace_abounds_test` then `pnpm --filter @grace-abounds/database migrate:test` — migration applied to the `_test` database only.
- Owner, Mac: `pnpm test:db` — 7 files, **57 passed** against PostgreSQL 17 (`grace_abounds_test`): forged/expired/mis-addressed assertions, foreign `sid`, session revoke/revoke-others, Member/Admin denied Pastor routes, suspension on next request, concurrent mutual demotion leaves one Pastor (DB helper and API), stale role change 412, recent-auth required, no credential leakage, atomic limiter (20 concurrent → 5), signup pre-hijack, non-enumerating signup/reset, keyed hashes, 5-guess void, purpose binding, concurrent resend → one usable code, newest-only, concurrent verify → one account, reset single use + revocation, password throttling before hashing, suspended password sign-in refused, all passkey/Google route-guard cases, JWT first sign-in + later reads for password/email-code/google/passkey, role change picked up, sign-out revocation, Google rules.
- Owner, Mac: `pnpm lint` — ESLint passes for web, api and media-worker (zero warnings, after `4f8da75`). `prettier --check .` still reports 10 frontend files (`app/error.tsx`, `help/layout.tsx`, `loading.tsx`, `next-steps/page.tsx`, `not-found.tsx`, `privacy/page.tsx`, `robots.ts`, `styles.css`, `template.tsx`, `terms/page.tsx`) that already failed at frontend snapshot `590f1bd` and on `main`; untouched by Phase 1. Proposed: a separate formatting-only commit with owner approval. `README.md` (unformatted by the docs consolidation) and Phase 1 files are formatted.
- Owner, Mac: `pnpm build` — all packages built; `next build` completed (Next 15.5.23), API `tsc --noEmit` clean.
- Owner, Mac, browser walkthrough (`pnpm dev`, dev console codes), 10 Nov: found and fixed `UntrustedHost` (`ddce987`: `trustHost` now true when `AUTH_URL` pins the origin). Then all passed: `staff:add` Pastor → email-code sign-in lands in the Pastor workspace; password sign-up with emailed verification → Member dashboard; both browsers still signed in after restarting the servers; profile phone saved and persisted after reload; password change asked for the current password first, then signed out other devices; sign-out → forgot/reset with code → new password works, old refused; second browser listed in Signed-in devices and signed out from the first; passkey registered with Touch ID after re-authentication, then passkey sign-in succeeded.
- Not run: real Google OAuth callback, real email delivery (Resend), suspension through UI (no directory UI until Phase 4; covered by API tests).

**Local setup facts (non-secret):** the Mac also runs a native PostgreSQL on `localhost:5432`, so the project's Docker database uses `POSTGRES_PORT=5433` (`.env` URLs updated by the owner; `.env.example` notes this). `.env` has `AUTH_URL`, `AUTH_TRUST_HOST=false`, `TRUSTED_PROXY_HOPS=0`, `AUTH_CHALLENGE_SECRET`, `TEST_DATABASE_URL`; the two placeholder secrets were replaced with random values by the owner's own command (values never shown to agents). Dev database `grace_abounds` and test database `grace_abounds_test` both at migration `20261110044618_phase1_identity`.

**Blockers before Phase 1 acceptance (historical, as of 12 Nov morning)**

1. Codex re-review of `1f54ff3..HEAD` (security fixes `1fabe30`, formatting `14670a1`, provider evidence).

Resolved since the Codex review: both P1 findings (`1fabe30`), Prettier baseline (`14670a1`), real Google OAuth, real Resend delivery, documentation stash (compared — tracked files identical to `544af29`, handover byte-identical md5 `bb05dd4e…` — then dropped on 12 Nov; stash commit `69af102ad7cc6ed5b4860b2f16e6357bff262dae` recoverable from the reflog until git garbage-collects it).

Carried to later phases (not Phase 1 blockers): staging/production OAuth origins and Google publishing review; production Resend key and DMARC tightening; suspension/role UI in the Phase 4 directory; retention wording before Phase 4.

**Owner setup:** Google OAuth client configured for local development (see Google evidence below); Resend sending domain `mail.graceabounds.nz` verified and delivering (local development key); AWS storage pending; hosting pending. No secrets belong here.

**Open decisions:** none for Phase 1. Before Phase 4 confirm retention/access wording; before Phase 6 choose hosting/budget and approve final content.

### Codex Phase 1 source review — head `223aca5`, 10 November 2026

**Verdict:** Changes requested before acceptance. Source review of the Phase 1 implementation and follow-up fixes is complete; the previous challenge serialization and streamed byte-limit findings are addressed. Migration and lockfile are committed. Recorded Mac test/browser evidence is acknowledged, not independently rerun by Codex. Real Google OAuth and Resend delivery remain pending.

**[P1] Revalidate password-change authority inside the commit transaction.** In `apps/web/app/api/account/password/route.ts:17–28`, recent session authority is checked before Argon2 hashing and never checked again inside the transaction. A recently authenticated request can pause there, another device can reset the password (revoking the original session), and the paused request can then overwrite the reset password and revoke the owner's new sessions. Serialize security mutations per user with a common lock, shared with reset/revocation, and reload account status/sessionVersion, session ownership/revocation/expiry and recent proof while holding it before writing. Add a deterministic test pausing password hashing, resetting/revoking, then resuming; stale change must fail and preserve the recovered password. Audit analogous credential mutations under the same protocol rather than adding a check with another race window.

**[P1] Bind password proof to the credential version used when creating a session.** `apps/web/lib/server/password-signin.ts` verifies a fetched hash and returns only profile identity. Later, `startSession` in `apps/web/lib/server/sessions.ts:50–74` independently reads the newest `sessionVersion`. A login with the old password can finish verification, pause, then resume after a reset and mint a valid session carrying the new version, defeating reset revocation. Carry server-only proof metadata (credential hash/version and security epoch) from authorization; atomically validate that it is still current when creating the session, serialized with credential changes/reset. Never accept proof metadata from browser/session-update input. A deterministic test must reset/change the password between verification and JWT session creation and show old proof denied, while fresh proof succeeds. When a Settings intent exists but its bound session has become invalid, fail closed instead of falling through to a new session.

**Evidence correction:** `pnpm lint` is not fully passing: ESLint passes, but repository Prettier still reports ten baseline files. This is a mechanical cleanup and needs no new product decision. Claude may format only those ten files in a separate commit, then rerun the formatting check; no unrelated refactoring. Fix the malformed status/role row in the inventory and refresh stale pending browser-evidence cells too.

**Next instruction for Claude (historical, done in `1fabe30`/`14670a1`):** Fix the two security findings above with focused deterministic regression tests, using the smallest shared concurrency mechanism. Reuse the existing test setup; do not repeat a general audit. Format the ten identified baseline files in a separate formatting-only commit and correct the handover inventory/status. Run relevant focused tests, then the required Phase 1 checks after the final code changes. Guide the owner through Google OAuth and Resend setup one step at a time and record real-provider evidence. Keep this as the sole handover. Do not merge, push or deploy; return the diff/evidence for Codex review.

### Claude response to Codex Phase 1 review — 10 November 2026

**Commits:** `1f54ff3` (Codex review recorded) · `1fabe30` security fixes · `14670a1` formatting-only (ten baseline files) · `cdc0186` inventory fixes · this update.

**[P1] Password-change authority — fixed.** One shared mechanism, `lockUserSecurity(tx, userId)` (transaction advisory lock, class `7204103`, keyed by user id) plus `checkSessionAuthority` (session owned, unrevoked, unexpired, created under the current `sessionVersion`, account active, optional recent proof), both in `@grace-abounds/database`. Every credential/session mutation takes the lock inside its transaction and re-checks authority before writing: password add/change (`/api/account/password`, hashing stays outside the lock), reset confirm, re-authentication (password proof re-checked by hash fingerprint; code consumed in the same transaction), sign-in session creation (`startSession`), `DELETE /v1/me/sessions/:id`, `POST /v1/me/sessions/revoke-others`, `DELETE /v1/me/google`, `DELETE /v1/me/passkeys/:id` (API helper `lockAndRecheck`), and suspension (target user locked after the Pastor-set lock). Lock order: Pastor set → challenge → user security; no path takes them in reverse.

**[P1] Password proof bound to session creation — fixed.** `authorizePassword` returns server-only `passwordProof` (`sessionVersion` + SHA-256 fingerprint of the verified Argon2 hash). The `jwt` callback passes it to `startSession`, which, under the user lock, refuses a password sign-in whose proof no longer matches the current hash or `sessionVersion` (covers both reset and Settings change). Proof is never read from the browser or session-update input. Linking/registration now run only inside a request-scoped `AsyncLocalStorage` context set by the route guard after its intent + recent-auth checks; the intent cookie alone no longer enables linking anywhere. If the linking session is no longer valid and recent, `startSession` throws; no fallback session is created.

**Deterministic regression tests (new/updated):** `password-race.test.ts` — hash held open while a reset completes → stale change 401, recovered password kept, fresh session untouched; hash held while the session is revoked → 401, password unchanged; no interference → 200 and only other sessions revoked; re-auth verification held while the password is replaced → 400, `authenticatedAt` unchanged. `jwt-session.test.ts` — proof made before a reset refused with no session created, fresh proof succeeds with `sv: 2`; proof before a Settings change refused; password session without server proof refused; forged `update` input ignored; linking from a revoked or stale session fails closed with no new row; intent cookie alone does not link. `auth-guards.test.ts` — handlers record that signed-out Google/passkey sign-in run without a linking context and allowed linking/registration run inside it for the current session.

**Formatting:** the ten baseline files formatted in `14670a1` only. Verified nine are token-identical apart from whitespace/punctuation layout; `styles.css` differs only by 666 added leading zeros (`.5rem` → `0.5rem`). Inventory status/role row and stale evidence cells corrected.

**Checks after the final code change (`1fabe30`/`14670a1`), owner's Mac:**

- `pnpm test:db` — 8 files, **66 passed** (PostgreSQL `grace_abounds_test`).
- `pnpm test && pnpm lint && pnpm build` — 12 files / 40 passed (58 DB tests skipped as designed); ESLint clean for web, api, media-worker; `prettier --check .` — **All matched files use Prettier code style!**; all packages built, `next build` completed.
- Claude, linked VM: `tsc --noEmit` clean for database, api, web.

**Real Google OAuth — owner, 11 November 2026 (local dev).** Non-secret setup: Google Cloud project "Grace Abounds" on the church-controlled Google account; Google Auth Platform, audience External, publishing status **Testing** with listed test users; Web application client "Grace Abounds – local development", JavaScript origin `http://localhost:3000`, redirect URI `http://localhost:3000/api/auth/callback/google`; scopes are the Auth.js defaults (openid, email, profile). ID/secret entered by the owner into `.env` via a hidden prompt; Claude checked only their shape. Browser results after restarting `pnpm dev`, all pass: (1) new Google sign-up with a non-staff test account → Member dashboard, Settings shows Google connected, session listed as "Signed in with Google"; (2) local email-code account created first for a second test account → "Continue with Google" with that account refused with the OAuthAccountNotLinked guidance (no automatic linking); (3) the same person signed in by email code → Settings → Connect → re-authentication by emailed code → Google → "Google account connected."; (4) "Continue with Google" then signs in to that same account. Before launch: add the staging/production origins and callbacks, and review Google's publishing/verification requirements for the real audience (sign-in scopes only).

**Resend email — owner, 12 November 2026.** Non-secret setup: Resend team "graceaboundsintl" (church account); sending domain `mail.graceabounds.nz`, region Tokyo (`ap-northeast-1`; Resend states account data and logs stay in the US — note for the privacy policy); receiving off. DNS for `graceabounds.nz` is hosted at 1st Domains (`ns1/ns2.1stdomains.net.nz`); the zone previously held only the parking-page `A` and `www` `CNAME` records (no MX, no existing DMARC), which were left untouched. Added: `TXT resend._domainkey.mail` (DKIM public key), `CNAME rsend.mail → rsend-apne1.forge.rmta.net`, `CNAME send.mail → send.forge.rmta.net`, `TXT _dmarc "v=DMARC1; p=none;"` (monitoring only). Domain verified in Resend. API key "Grace Abounds – local development" created with **Sending access** restricted to `mail.graceabounds.nz`; the owner entered `RESEND_API_KEY` via a hidden prompt (Claude checked only its shape) and `EMAIL_FROM="Grace Abounds <no-reply@mail.graceabounds.nz>"`; dev server restarted. Owner results, all pass: email-code sign-in to a real inbox delivered from Grace Abounds and signed in (no `[dev email]` console output); password reset code delivered, new password set and used to sign in; Gmail "Show original" reported SPF, DKIM and DMARC PASS. Before launch: separate production key per environment, a monitored reply/support address, and DMARC tightening (`p=quarantine` with reporting) once delivery has been observed.

### Codex final Phase 1 re-review — 12 November 2026, head `e00aea1`

**Verdict: one focused security fix still required before Phase 1 acceptance.** Both earlier password findings are resolved in source: password writes recheck authority under the shared security lock, and password login proof is bound to the hash/security epoch and checked during session creation. Deterministic regression tests cover both. The separate ten-file formatting commit was inspected; no functional change identified. Google and Resend local acceptance evidence above is acknowledged. Codex did not repeat installs, migrations or the recorded test/browser suite in this review.

**[P1] Check linking authority at the credential write, not only at JWT creation.** In `apps/web/auth.ts`, the adapter still inherits `linkAccount` and `createAuthenticator` directly from PrismaAdapter. `runLinked` sets request context, but the per-user lock/recheck in `startSession` happens in the JWT callback. Auth.js 0.41.3 calls `handleLoginOrRegister` (which writes `linkAccount`) and, for passkey registration, `createAuthenticator`, **before** `callbacks.jwt`. Therefore: valid Settings intent passes the route guard → callback pauses → owner resets password/revokes that session → callback resumes and saves the new Google account/passkey → JWT refuses the revoked session, but the new credential remains linked. That credential can later authenticate independently. Rejecting session creation does not roll back the adapter writes.

Fix by guarding actual linking/registration persistence using the request-scoped context, shared `lockUserSecurity` and in-transaction `checkSessionAuthority(requireRecent: true)`. Assert the credential target user equals the context user. Ensure no usable Google/passkey credential remains when authority is invalid, including intermediate account rows. Avoid holding a DB lock during provider network calls. Preserve legitimate new-user Google registration and normal sign-in. A check in an audit event after persistence is too late.

Add deterministic adapter/callback-level tests that pause before persistence, complete reset or session revocation, then resume. Assert **no new linked Account/Authenticator**, not only no new UserSession; include valid recent linking as the success control. Existing tests only establish that the route supplies context and `startSession` fails closed, which misses earlier writes.

Source ordering verified against the pinned upstream source:

- https://github.com/nextauthjs/next-auth/blob/%40auth/core%400.41.3/packages/core/src/lib/actions/callback/index.ts (OAuth handleLoginOrRegister before JWT; WebAuthn createAuthenticator before JWT).
- https://github.com/nextauthjs/next-auth/blob/%40auth/core%400.41.3/packages/core/src/lib/actions/callback/handle-login.ts (linkAccount persistence).

**Next instruction for Claude (historical, done in `ca0a20b`):** Address only the credential-persistence finding above with focused regression coverage. Update this handover and rerun affected checks; request a final Codex checkpoint. No merge, push or deployment yet. Do not start Phase 2 or change the sidebar. The owner has requested planning only for a calmer Pastor/Admin sidebar; member navigation should remain unchanged, and any implementation awaits agreement on that plan.

**Documentation cleanup at next update:** label earlier provider-pending and old lint/test statements as historical, and point the live status/next instruction to this verdict, so older evidence cannot be mistaken for current blockers. Keep one handover file.

### Claude response to Codex final re-review — 12 November 2026

**Commit:** `ca0a20b` (on top of Codex's `93b2e39`). Nothing merged, pushed or deployed. Sidebar untouched (planning only); Phase 2 not started.

**[P1] Linking authority checked at the credential write — fixed.** Confirmed in installed `@auth/core` 0.41.3 (`lib/actions/callback/index.js`, `handle-login.js`): `linkAccount` (OAuth with session, WebAuthn with session, new-user OAuth/WebAuthn) and `createAuthenticator` run before `callbacks.jwt`. The adapter in `apps/web/auth.ts` now overrides both:

- `linkAccount` → `persistLinkedAccount`: inside a verified linking context it runs one transaction that takes `lockUserSecurity`, requires the credential's `userId` to equal the context user, and requires `checkSessionAuthority(requireRecent: true) === 'ok'` before `account.create`; otherwise `CredentialRefused` and nothing is written. Without a linking context the only allowed link is the first provider of a user created by `adapter.createUser` in the same request (brand-new Google sign-up); any other link is refused.
- `createAuthenticator` → `persistAuthenticator`: same in-transaction check; never allowed without a linking context. If authority is lost between Auth.js's `linkAccount` (passkey `Account` row) and `createAuthenticator`, the passkey `Account` row is deleted as well, so no intermediate credential remains.
- Every Auth.js handler call in the route wrapper now runs in a request-scoped context (`runAuthRequest`); the verified `link` is set only where the guard approved it. No DB lock is held during provider network calls (the lock is taken only in the short write transaction).

**Regression tests:** `apps/web/lib/server/credential-persistence.test.ts` (11) drives the real adapter from `authConfig` in Auth.js order and asserts **no `Account`/`Authenticator` rows** remain: Google link paused before the write then session revoked → refused; reset transaction holding the user lock while the link waits behind it → refused; stale authentication → refused; credential for another user → refused; no context (inside and outside a request) → refused; passkey with session revoked before the first write → nothing saved; reset between the two passkey writes → both rows absent; passkey without context → refused. Success controls: valid recent linking saves the Google link; valid passkey registration saves both rows; new Google sign-up links to the user created in the same request (email normalized).

**Checks after `ca0a20b`, owner's Mac:** `pnpm test:db` — 9 files, **77 passed**. `pnpm test` — 12 files / 40 passed (69 DB tests skipped as designed). ESLint clean for web, api, media-worker. `prettier --check .` flagged only this handover (Codex's unformatted addition), formatted in this update. Claude, linked VM: `tsc --noEmit` clean for web. Owner re-run after the handover formatting (`1e74aea`): `pnpm lint && pnpm build` — ESLint clean, `prettier --check .` **All matched files use Prettier code style!**, all packages built and `next build` completed. Owner browser re-check with `pnpm dev` through the new write guard, reported working: new Google sign-up, Settings → Google → Connect (after re-authentication), and passkey registration with Touch ID.

**Next instruction for Codex (paste into Codex):**

> Final Phase 1 checkpoint on `backend-phase-1` at HEAD: review `ca0a20b` (credential-persistence fix and tests) against "Claude response to Codex final re-review" in `docs/handoff/PROJECT-HANDOVER.md`. Record a Phase 1 acceptance verdict or findings in this file. No merge, push or deploy.

**Next instruction for Claude (paste into Claude):**

> Read the latest Codex verdict at the end of `docs/handoff/PROJECT-HANDOVER.md`. If Phase 1 is accepted, draft the calmer Pastor/Admin sidebar plan (planning only, member navigation unchanged) and a Phase 1 merge plan for my approval; otherwise fix the findings with focused tests. Update the same file. No merge, push or deploy without my explicit approval.

### Navigation trial — Codex, 12 November 2026

Owner approved implementation of the proposed navigation trial. Shared WorkspaceShell now has a desktop collapse/expand toggle for all three roles, accessible icon labels/native tooltips, a browser-local remembered preference, and the existing mobile drawer with focus/Escape behavior retained. Messages moved from the sidebar to a bottom-right shortcut (hidden on the Messages page and inert behind the mobile drawer); no fabricated unread count or new messaging backend. Home links now target the current role; workspace brand/title return there. A visible return link on public Events & calendar closes the navigation dead end. Other sidebar destinations and page layouts are unchanged.

Styling is isolated in `apps/web/app/workspace-navigation.css`; the owner's pre-existing uncommitted `styles.css` edits were preserved and must not be included accidentally in this change. No backend/auth changes.

Checks: 14 focused tests passed (workspace shell, header, role navigation), changed-source ESLint passed, whitespace check passed. Standard web typecheck was blocked by existing duplicate generated `.next/types/* 2.ts` declarations. A source typecheck excluding only those duplicate generated files passed (150 entries); generated files were not deleted. No browser visual acceptance or production build run; localhost:3000 was not running. Owner to preview desktop expanded/collapsed and mobile drawer on Pastor/Admin/Member, check floating-button placement and Events → Home, then decide whether Home layout needs further work. Backend Phase 1 acceptance review remains separate.

### UI side quest — agreed brief, 12 November 2026

This brief supersedes earlier sidebar suggestions. Complete a focused plan first; the owner has not yet approved the final palette or implementation of these refinements. Existing navigation trial `f18bc04` remains the baseline. Backend phases are paused for this small UI checkpoint; no backend redesign is needed.

**Purpose:** make Pastor/Admin workspaces calmer, preserve easy navigation for every role, and fix the reported Home calendar overlap. Keep the member experience familiar. No new features, dependencies, messaging backend or broad redesign.

**Scope and decisions**

1. Desktop sidebar starts fully collapsed to its icon rail when no saved preference exists; retain labels through accessible names and tooltips. Remember an explicit expand/collapse choice across navigation and login; do not reset an existing preference on every login. Replace the prominent collapse control with a subtle top-bar panel icon, clear focus state, tooltip and accessible expanded state. Mobile keeps its closed drawer, Escape/focus handling and accessible opener. Home remains reachable in both modes.
2. Retain the floating bottom-right Messages shortcut and the Events/calendar return link. Verify safe-area spacing and no obstruction of form actions, calendar controls, dialogs or the mobile drawer. Do not invent unread counts.
3. Workspace light theme must match the **actual yellow logo**. Inspect the logo and current theme tokens first. Propose neutral white/light-grey surfaces, charcoal text, logo-yellow primary actions with dark labels, pale-yellow active navigation and restrained yellow highlights. Reduce large brown/dark surfaces and pervasive cream in light mode. Do not use olive as the primary accent. Do not use bright yellow body/link text on white. Verify text, focus, selected, hover, disabled and error states with appropriate contrast. Semantic errors/success need not be yellow.
4. Trial palette applies to workspaces (including shared member workspace surfaces), not a recolouring of the public website. Preserve public brand styling and intentional dark mode; ensure explicit light/dark/system settings still work. Avoid a global token override that accidentally changes the public pages. Prefer scoped workspace tokens/styles and reuse existing components.
5. Diagnose the Pastor Home calendar position/overlap from the actual rendered screen. Identify the precise route, component and CSS rule; inspect the relevant grid/flex layout, fixed/sticky positioning, offsets, intrinsic sizing and overflow. Fix the cause, not arbitrary negative margins or fixed heights. Inspect staff CMS only if it shares the faulty layout; do not conflate `/pastor` Home with `/admin/cms` or redesign unrelated pages.

**Preserve current work:** `apps/web/app/styles.css` has owner colour experiments already uncommitted. Inspect that diff and build on or isolate it deliberately. Do not discard, overwrite or silently include unrelated changes in a commit. Do not read or alter secrets. Keep auth/API/database changes out of the UI side quest.

**Claude step A — plan and diagnose only**

Read this section and relevant source/diffs, avoiding another broad audit. Use the owner's running app for focused visual inspection when available; if the exact broken screen cannot be reproduced, request its route and viewport/screenshot before guessing. Return one concise proposal: exact sidebar interaction, a small palette swatch/token table sampled against the real logo, calendar root cause with affected files, and focused acceptance checks. Record it in this same handover. Wait for the owner's approval of that concrete proposal before changing UI code. Do not create another plan/backup file.

**Claude step B — only after proposal approval**

Implement the smallest reversible patch, separating the calendar correction from theme/navigation changes where practical. Verify Pastor/Admin Home, member Home, public Events → role Home, staff CMS if affected, Messages shortcut, expanded/collapsed desktop navigation, mobile drawer and light/dark/system modes. Check representative desktop, tablet and narrow mobile widths; no overlapping sections or horizontal overflow; keyboard navigation, tooltips/focus and dialog stacking remain usable. Keep meaningful navigation regressions; run affected tests and source checks. Record any generated-type baseline problem honestly instead of deleting unknown build files. Record exact evidence and limitations; screenshots alone do not prove functional navigation. Owner visually accepts the trial, then Codex performs a focused diff review. No merge, push or deployment without existing project approval rules.

### UI side quest — step A proposal (Claude, 12 November 2026) — awaiting owner approval

Source/diff inspection only; no UI code changed. Baseline `f18bc04`. Owner's uncommitted `styles.css` experiment (walnut → slate/charcoal tokens, 73 lines; it also affects public pages) is left untouched and unstaged; nothing below depends on it.

**1. Sidebar (files: `components/workspace-shell.tsx`, `workspace-navigation.css`, the existing pre-hydration theme script in `layout.tsx`).**

- No saved preference → desktop starts collapsed (icon rail). Saved `grace-sidebar-collapsed` = `true`/`false` is honoured; it is never cleared on sign-in/out, so a user's explicit choice persists. The existing inline theme script also sets `data-sidebar` on `<html>` before paint, so neither default nor saved state flashes.
- The large in-sidebar "Collapse sidebar" button is removed. A subtle 36 px icon-only button sits at the left of the desktop top bar (`PanelLeftOpen`/`PanelLeftClose`, 18 px): no border at rest, light hover tint, 2 px charcoal focus ring, `title` tooltip, `aria-label` "Expand/Collapse sidebar", `aria-expanded`, `aria-controls="workspace-navigation"`. Hidden at ≤900 px, where the existing Menu drawer (Escape, scrim, focus return, `inert`) is unchanged.
- Collapsed rail keeps icon links with accessible names and tooltips; Home stays the first item; Events → role Home link, "Back to home", floating Messages button and safe-area spacing unchanged.

**2. Workspace light palette (new `apps/web/app/workspace-theme.css`, imported beside `workspace-navigation.css`).** Scoped to `:root:not([data-theme='dark']) .workspace` (Member, Pastor and Admin shells). It overrides existing tokens only inside workspaces, so public pages and dark mode are untouched; deleting the file reverts it. Logo sampled from `public/brand/logo.png`: metallic gold, face median `#FCBA1A`, mid-tone `#E79104`; the current `--gold` `#F3B000` is already within 1.1:1 of the logo.

| Role                                     | Value                                                         | Contrast (WCAG)             |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------- |
| Page background                          | `#F6F6F4` light grey                                          | —                           |
| Cards, sidebar, top bar                  | `#FFFFFF` + `#E3E3DF` hairline                                | —                           |
| Body/heading text                        | charcoal `#1F2328`                                            | 15.8 on white, 14.6 on page |
| Secondary text                           | `#596067`                                                     | 6.4 / 5.9                   |
| Primary button                           | logo gold `#F2B31C`, label `#1F2328`; hover `#E0A10C`         | 8.5 / 7.0                   |
| Active nav item                          | pale yellow `#FDF0C2`, charcoal text, 3 px `#9A6A00` left bar | 13.9 text; bar 4.7 vs white |
| Highlights (selected/today day, notices) | `#FFF8E1`                                                     | —                           |
| Links in workspace                       | dark amber `#7A4F00`                                          | 7.1 / 6.6                   |
| Input/control outlines                   | `#858B91`                                                     | 3.4 / 3.2 (≥3:1 non-text)   |
| Focus ring                               | 2 px `#1F2328`, 2 px offset                                   | 15.8                        |
| Error / success                          | `#B42318` / `#1E7A4C`                                         | 6.6 / 5.3                   |
| Floating Messages button                 | charcoal `#1F2328`, white label, gold border                  | 15.8                        |

Gold is never used as text on white (1.9:1). The dark sidebar and active gold text become light; olive is not used as an accent.

**3. Pastor Home calendar overlap — root cause.** Route `/pastor` re-exports `app/members/page.tsx` (Member Home, same layout; no other page uses it). The left column is one `<Reveal>` containing `<SundayStatus />` and `<MemberCalendar />`. `styles.css` (≈ line 5743) sets `.member-overview-grid > .reveal > * { height: 100% }`. That rule dates from `032aa0b`, when the column held only the calendar. `718d119` added the Sunday card to the same column, so **both** children are forced to the full column height: the Sunday card stretches tall and the calendar starts a full column-height lower, overflowing the grid row onto the "Staff shortcuts" panel and sections below. `.member-calendar { min-height: 35rem }` and `.sunday-status { margin: 1rem 0 }` add to it. `/admin/cms` does not share this layout.

- **Fix (source rule, no magic numbers):** make that column a flex column (`display:flex; flex-direction:column`), drop `height:100%` from its children, and let the calendar take the remaining space (`flex:1 1 auto`). It's a one-rule change in `styles.css`, committed **hunk-only** (staged with a patch) so the owner's colour experiment stays unstaged. Separate commit from palette/navigation.
- To confirm against the rendered screen before changing code: the owner sends one screenshot of `/pastor` at the width where it occurs. Expected appearance: tall, mostly empty "This Sunday" card with the calendar sliding over "Staff shortcuts".

**Step B acceptance checks (after approval).** Three commits: calendar, navigation, palette. Then:

- Pastor, Admin and Member Home at 1440, 1024, 768 and 375 px: no overlap or horizontal scroll.
- Desktop: default collapsed with no saved preference; expanded choice survives reload and sign-out/in; toggle reachable by Tab with tooltip and `aria-expanded`.
- Mobile: drawer opens/closes with Escape, focus returns, page inert behind it.
- Events → role Home, "Back to home" and the Messages button don't cover form actions, calendar controls or dialogs.
- Light/dark/system all switch correctly; public Home, Events and Give unchanged in light and dark.
- `workspace-shell.test.tsx` updated for the default-collapsed state and topbar toggle; `pnpm test`, lint and build pass.
- Owner visual acceptance, then Codex focused diff review. Phase 1 final checkpoint and the Phase 2 plan follow; no merge, push or deploy.

### UI side quest — owner feedback and site-wide theme proposal (12 November 2026) — awaiting approval

**Done after the step A approval (each commit separate and reversible):** `37db912` calendar overlap fix (hunk-only, owner experiment excluded); `bd4b4d5` desktop sidebar collapsed by default with remembered choice and no flash; `a8a8a08` workspace light palette (`workspace-theme.css`); after owner feedback, `d2754e7` toggle moved to the top of the sidebar beside the logo; `11fb690` "Events & calendar" opens `/members/calendar` inside the workspace (public `/events` unchanged). Pending: a screenshot of the leftover old colours in the Admin sidebar.

**Owner decision (12 Nov):** apply a new theme to the whole website, public pages included, without keeping the old walnut/cream/olive scheme. Centralise colours so they are easy to edit.

**Proposal**

1. **One colour file.** New `apps/web/app/theme.css`, imported first, becomes the only place with colour values. It has two layers: a small raw palette (logo gold `#F2B31C`, gold hover `#E0A10C`, dark gold `#9A6A00`, dark amber `#7A4F00`, pale gold `#FDF0C2`/`#FFF8E1`, charcoal `#1F2328`, greys `#31363B`/`#596067`/`#858B91`/`#E3E3DF`/`#F6F6F4`, white, error `#B42318`, success `#1E7A4C`), and semantic tokens components use (page, surface, text, muted text, heading, accent, on-accent, link, border, control, focus, dark section, hero overlay, success, error). Existing token names (`--gold`, `--ink`, `--surface`, `--cream`, `--walnut`, `--maple`, …) become aliases, so the 748 existing `var()` uses keep working. The one dark-mode block lives there too.
2. **Remove scattered colours.** The ~190 literal colours in `styles.css` (66 hex, 123 `rgba`) become tokens; translucent shades use `color-mix(in srgb, var(--token) N%, transparent)`. A small test fails if a colour literal appears in any stylesheet other than `theme.css`, which keeps it centralised. The Google logo colours in `forms.tsx` stay (brand-mandated).
3. **New look, everywhere.** White/light-grey sections instead of cream/linen; charcoal headings and text; logo-gold buttons with dark labels; dark-amber links; dark sections and the footer in charcoal with white text and gold accents; photo heroes keep a neutral dark overlay for legible white text; olive, maple, wine and walnut retired. Dark mode becomes a neutral charcoal theme with the same gold. `workspace-theme.css` keeps only sidebar layout rules, with no colour values.
4. **Two commits so review stays small:** (A) centralise with the _current_ colours, so there's no visual change and the review is mechanical; (B) change the palette values in `theme.css` only, which is the actual new theme.
5. **Owner's uncommitted `styles.css` experiment** (walnut → slate/charcoal) is folded into commit A deliberately as the starting point, and superseded by the new palette in B.

**Verification:** the 7 public pages and Member/Pastor/Admin workspaces in light and dark at 1440/1024/768/375 px; contrast table re-checked for text, buttons, links, focus and dark sections; `pnpm test`, lint and build; owner visual acceptance; Codex focused review. Then back to the Phase 1 final checkpoint and Phase 2. No merge, push or deploy.

**Return to backend phases:** this side quest does not itself accept or merge Phase 1. Codex still needs to record its final review of credential-persistence fix `ca0a20b` and the latest evidence. Once that checkpoint and the UI side quest are accepted, prepare a concrete merge plan for the owner, then continue Phase 2 from the existing backend plan (CMS/database persistence and uploads). Do not reopen settled identity decisions or repeat successful provider setup.

**Instruction to paste into Claude:**

> Read the latest "UI side quest — agreed brief" in `docs/handoff/PROJECT-HANDOVER.md`. Start step A only: inspect the existing navigation trial, preserve my uncommitted colour experiments, diagnose the Pastor Home calendar overlap and propose a subtle sidebar control plus a yellow-logo-matched neutral light workspace palette. Desktop defaults collapsed only when no preference exists; preserve the user's choice and the mobile drawer. Keep public-site branding and dark mode intact. Record one concise proposal and verification plan in the same handover and wait for my approval before implementation. After approval, follow step B, then return to the existing backend phases through the pending final Phase 1 checkpoint. No new handover files, backend redesign, merge, push or deployment.

### Codex checkpoint and return to Phase 2 — 12 November 2026

**Verdict:** Phase 1 accepted for local development progression after source review of `ca0a20b` and its credential-write regression tests, together with the recorded 77 database tests and real Google/Resend/Touch ID acceptance evidence. Authority is now rechecked under the shared user-security lock at adapter persistence, with cleanup of the intermediate passkey Account when authority is lost. No unresolved blocking finding identified in this focused review. This is not a production-launch sign-off; production origins/provider settings, operational controls and remaining application phases are still required.

**UI side quest:** owner reports the requested changes complete. Reviewed changes through `f1b9d02`: calendar column sizing, default-collapsed remembered sidebar, in-workspace Events/calendar and centralised gold/neutral light/dark theme. Site-wide colours supersede the earlier workspace-only proposal by the owner's recorded decision. The gold accent band experiment was reverted. No further UI redesign is planned for Phase 2.

**Fresh Codex checks:** regular suite initially exposed six sidebar tests depending on a partial Node localStorage implementation; the test now uses an explicit per-test in-memory Storage fixture (no application behavior changed). Re-run: **48 tests passed**, 69 DB tests intentionally skipped. `pnpm typecheck`, `pnpm lint` (including full Prettier check), and `pnpm build` all passed. DB/provider/browser acceptance was acknowledged from the recorded owner results, not independently repeated. Only `.env.example` is tracked among environment files; real `.env` remains ignored. Generated tracked tsbuildinfo changes from checks were restored. Worktree was otherwise clean at review start.

**Git scope:** owner authorized a push if review was safe. Commit this checkpoint and the test fixture, then push `backend-phase-1` to origin without force. Do not merge main or deploy as part of this push. A new Phase 2 branch can start from this reviewed branch tip while main merge is coordinated separately; never start Phase 2 from the old frontend-only main by accident.

**Current next instruction for Claude (supersedes old planning/wait instructions):**

> Phase 1 and the UI side quest have passed the Codex checkpoint. Read this section and the existing Phase 2 scope. Create `backend-phase-2` from the reviewed Phase 1 tip (inspect status first); keep Phase 1 history intact and do not merge/deploy. Start with a compact inventory of all seven pages/shared CMS fields and actions, schema/contracts, migration/import approach and existing browser-storage boundary. Record it in this same file, then implement the smallest complete Phase 2 slices: shared settings/page content persistence and immediate publishing first, followed by structured collections, revisions/restore, cache invalidation and verified uploads. Preserve the accepted theme/navigation; no redesign or repeated auth audit. Keep resource-specific payloads, If-Match checks, staff permissions, private-data exclusion, truthful toasts and failure/retry behavior. Follow the owner-runs-install/migration/server agreement, one command at a time. Storage provider remains a Phase 2 decision: the owner discussed R2 costs but has not selected it over the original S3 plan. Compare current expected storage/video delivery costs and confirm one provider before provisioning paid resources; continue DB/CMS work while setup is pending. Do not mark Phase 2 complete until its existing acceptance gates pass, including cross-browser persistence and restart checks. Update this sole handover with exact commits, evidence and blockers, then request focused Codex review. No merge, push or production deployment without authorization.
