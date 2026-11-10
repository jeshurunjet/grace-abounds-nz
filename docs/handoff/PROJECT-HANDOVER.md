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

| Phase | Status                                                                          | Evidence / blocker                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | Complete — accepted by Codex                                                    | Source review, defaults confirmed, session design below.                                                                                                                                                     |
| 1     | Implemented; automated checks verified; browser and provider acceptance pending | `backend-phase-1`. Typecheck, ESLint, build, 40 unit tests and 57 PostgreSQL tests pass (see Phase 1 section). Not yet: browser walkthrough, real Google callback, real email delivery, real-device passkey. |
| 2–6   | Not implemented                                                                 | Main remains a frontend prototype.                                                                                                                                                                           |

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

**Next action:** owner runs `node -v && pnpm -v && docker --version` and shares version output with Claude; Claude guides the remaining setup one command at a time, addresses findings above, updates live status here, and returns the verified Phase 1 diff for focused Codex review. No merge, push or deployment yet.

### Phase 1 implementation — Claude, 10 November 2026

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

| Visible action                       | Endpoint                                                                                  | Access             | Failure/pending handling                                                          | Evidence                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Email me a code / verify             | Auth.js `email-code` + guarded `GET /api/auth/callback/email-code`                        | Guest              | Notice only after accepted; inline error keeps email; TooManyAttempts voids codes | forms.test, auth-guards.test                               |
| Password sign-in                     | Auth.js `password` (Credentials)                                                          | Guest              | Generic error / rate-limited message; input kept                                  | forms.test, account.test                                   |
| Password sign-up + verify            | `POST /api/account/signup`, `/signup/verify`                                              | Guest              | 202 → code step; inline errors; success toast after 201                           | forms.test, account.test                                   |
| Forgot / reset password              | `POST /api/account/password-reset`, `/confirm`                                            | Guest              | Field errors inline; redirect `/login?reset=1` after 200                          | account.test                                               |
| Confirm it's you                     | `POST /api/account/reauth`                                                                | Signed in          | Inline error in modal; resumes the pending action                                 | jwt-session/auth-guards (proof time), API recent-auth test |
| Add/change password                  | `POST /api/account/password`                                                              | Signed in + recent | REAUTH_REQUIRED reopens modal; inline error                                       | — (browser walkthrough pending)                            |
| Connect / disconnect Google          | `POST /api/account/intent`, Auth.js Google, `DELETE /v1/me/google`                        | Signed in + recent | Result toast only after `/v1/me/security` confirms                                | auth-guards, jwt-session, API tests; real callback pending |
| Add / remove passkey                 | `POST /api/account/intent`, Auth.js WebAuthn, `DELETE /v1/me/passkeys/:id`                | Signed in + recent | Success toast only if the refreshed list grew                                     | auth-guards; real device pending                           |
| Devices list / sign out one / others | `GET /v1/me/sessions`, `DELETE /v1/me/sessions/:id`, `POST /v1/me/sessions/revoke-others` | Own                | Toasts on confirmed result; retry on load failure                                 | API tests                                                  |
| Edit profile                         | `GET/PATCH /v1/me` (`If-Match`)                                                           | Own                | VERSION_CONFLICT message + Reload; field errors                                   | — (browser walkthrough pending)                            |
| Suspend / change role                | `PATCH /v1/pastor/members/:id/status                                                      | role`              | Pastor                                                                            | 403/409/412 envelopes                                      | API tests (UI wiring is Phase 4 directory) |

Route deviations from the planned table: sign-out-others is `POST /v1/me/sessions/revoke-others`; `GET /v1/me/security` added; status route now requires `If-Match`.

**Checks actually run**

- Typecheck (Claude, in the linked VM with the Mac's `node_modules`, TypeScript 5.9.3): `tsc --noEmit -p .` in `packages/database`, `apps/api`, `apps/web` — no errors (after Prisma generate from the new schema).
- Prettier `--check` on all changed files — clean.
- Owner, Mac: `pnpm test` — 12 files, 40 passed, 49 DB tests skipped (as designed).
- Owner, Mac: `docker compose exec postgres createdb -U grace_abounds grace_abounds_test` then `pnpm --filter @grace-abounds/database migrate:test` — migration applied to the `_test` database only.
- Owner, Mac: `pnpm test:db` — 7 files, **57 passed** against PostgreSQL 17 (`grace_abounds_test`): forged/expired/mis-addressed assertions, foreign `sid`, session revoke/revoke-others, Member/Admin denied Pastor routes, suspension on next request, concurrent mutual demotion leaves one Pastor (DB helper and API), stale role change 412, recent-auth required, no credential leakage, atomic limiter (20 concurrent → 5), signup pre-hijack, non-enumerating signup/reset, keyed hashes, 5-guess void, purpose binding, concurrent resend → one usable code, newest-only, concurrent verify → one account, reset single use + revocation, password throttling before hashing, suspended password sign-in refused, all passkey/Google route-guard cases, JWT first sign-in + later reads for password/email-code/google/passkey, role change picked up, sign-out revocation, Google rules.
- Owner, Mac: `pnpm lint` — ESLint passes for web, api and media-worker (zero warnings, after `4f8da75`). `prettier --check .` still reports 10 frontend files (`app/error.tsx`, `help/layout.tsx`, `loading.tsx`, `next-steps/page.tsx`, `not-found.tsx`, `privacy/page.tsx`, `robots.ts`, `styles.css`, `template.tsx`, `terms/page.tsx`) that already failed at frontend snapshot `590f1bd` and on `main`; untouched by Phase 1. Proposed: a separate formatting-only commit with owner approval. `README.md` (unformatted by the docs consolidation) and Phase 1 files are formatted.
- Owner, Mac: `pnpm build` — all packages built; `next build` completed (Next 15.5.23), API `tsc --noEmit` clean.
- Not run: browser walkthrough, real provider flows.

**Local setup facts (non-secret):** the Mac also runs a native PostgreSQL on `localhost:5432`, so the project's Docker database uses `POSTGRES_PORT=5433` (`.env` URLs updated by the owner; `.env.example` notes this). `.env` has `AUTH_URL`, `AUTH_TRUST_HOST=false`, `TRUSTED_PROXY_HOPS=0`, `AUTH_CHALLENGE_SECRET`, `TEST_DATABASE_URL`; the two placeholder secrets were replaced with random values by the owner's own command (values never shown to agents). Dev database `grace_abounds` and test database `grace_abounds_test` both at migration `20261110044618_phase1_identity`.

**Blockers before Phase 1 acceptance**

1. Decide on the pre-existing Prettier baseline (10 frontend files).
2. Browser walkthrough with dev codes (`pnpm dev`): password sign-up → sign-in → restart servers → still signed in; email-code sign-in; reset; Settings re-auth, password change, devices revoke from a second browser; profile save in two browsers; `staff:add` Pastor suspends a Member who is then signed out.
3. Real Google OAuth client (callback `http://localhost:3000/api/auth/callback/google`): new-user sign-up, existing-email refusal, Settings linking.
4. Resend + verified domain for real code/reset delivery (dev console codes are not delivery evidence).
5. Real-device passkey registration/sign-in (Auth.js WebAuthn is experimental upstream).
6. Documentation stash `phase0: consolidated handover from main` still held; compare and drop when Codex agrees.

**Owner setup:** Google client pending; Resend/domain verification pending; AWS storage pending; hosting pending. No secrets belong here.

**Open decisions:** none for Phase 1. Before Phase 4 confirm retention/access wording; before Phase 6 choose hosting/budget and approve final content.

**Next instruction for Codex (paste into Codex):**

> Review `backend-phase-1` commits `53ee7de..3949f34` against the "Phase 1 implementation" section of `docs/handoff/PROJECT-HANDOVER.md`, focusing on the three preliminary findings and session/linking/passkey guards. Automated evidence is recorded there; browser and provider acceptance are still pending. Record findings in this file. No merge, push or deploy.

**Next instruction for Claude (paste into Claude):**

> Continue Phase 1 acceptance on `backend-phase-1` from the blockers list in `docs/handoff/PROJECT-HANDOVER.md`: guide lint/build and the browser walkthrough one command at a time, fix any Codex findings, then guide Google and Resend setup when I'm ready. Update the same file. No merge, push or deploy.
