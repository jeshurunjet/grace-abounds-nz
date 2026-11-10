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

| Phase | Deliverable | Exit evidence | Owner dependency |
| --- | --- | --- | --- |
| 0 — reconcile | Inspect draft against main; confirm signup/reset defaults; inventory auth compatibility, CMS fields/actions and environment loading. Preserve the final UI and this handover on the working branch. | Explain chosen session implementation; list draft fixes, missing dependencies and exact setup commands. | Confirm the three defaults above. |
| 1 — identity and access | Real verified accounts; password/signup/reset, email code, Google; canonical user/profile IDs; signed gateway; `/me`; Pastor roles/status; audit and bootstrap. Add passkeys after core auth works, but verify or explicitly resolve them before full launch. Settings session list/revoke must reflect actual server state, with durable session records if needed alongside JWTs. | Account survives restart; guessed IDs and forged identity denied; Member/Admin restrictions; immediate suspension/reset revocation; final-Pastor concurrency; atomic challenge/rate limits; real Google callback; real password recovery. No demo-profile fallback or production demo credentials. | Local PostgreSQL/install; Google client. Resend for real email verification. |
| 2 — CMS and uploads | All seven public pages/shared content, locations/team/next steps/resources/sermon metadata backed by DB; image/avatar uploads; versioned writes, revision restore, safe preview and cache invalidation. Replace sitemap seed data and example origins. | Complete field-to-contract inventory here; two browsers see durable edits after restart; Admin/Pastor publish immediately; stale save rejected; restore audited; drafts/private data excluded; upload bytes/type/size/access verified. | S3 setup and real church content. |
| 3 — activities and bookings | Unified activities, NZ recurrence/exceptions, memberships, transactional bookings, rosters, cancellations, assignments integration and correct .ics downloads. | DST gaps/ambiguities and changed occurrences tested; parallel last-place claims produce one winner; duplicate retries safe; schedule/cancellation notices durable; date ranges bounded. | Confirm actual schedules and capacities. |
| 3b — public Google calendar | One-way published activity sync through a service account, stable external IDs, update/cancel/retry and public subscribe link. | Real create/update/cancel visible in church calendar; retry has no duplicate; private/member data never copied. Can follow launch if clearly labelled unavailable. | Church calendar and narrowly shared service-account access. |
| 4 — member workspace | Conversations, prayer, appointments, applications, assignments, resource downloads and limited staff directory. Finish replacing member browser storage. | Two real accounts and both staff roles exercised; Admin cannot retrieve care data; unrelated members denied; requested vs confirmed appointments handled; confidential notes absent from member payloads; protected download expires. | Owner confirms care access and retention before real records. |
| 5 — jobs, accounts and media | Durable email/in-app notifications/preferences; export/deletion; sign-out-everywhere; FFmpeg sermon upload/processing/status/retry/playback. Provider IDs and failure status persist; no completed-state claims for queued work. | Restart/retry tests without duplicate effects; export ownership/expiry; deletion revocation/retention; real media upload to playable output; failed output cannot publish; bounded worker resources and logs without private bodies. | Real recordings; storage/email; worker host with FFmpeg. |
| 6 — staging and launch | Choose hosts, wire CI/deploy migrations, staging and production environments, TLS/domain, monitoring/backups/restore; finish content, SEO/accessibility and role/mobile acceptance. | Typecheck/tests/lint/build pass; browser matrix and provider flows verified; restore into isolated DB demonstrated; rollback and migration plan reviewed; all remaining limitations explicit; owner approves concrete staging result before production cutover. | Hosting/budget choice, DNS access, approved church/bank/legal content and launch approval. |

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

| Phase | Status | Evidence / blocker |
| --- | --- | --- |
| 0 | Review complete; awaiting Codex checkpoint | Claude source inspection, 10 Nov 2026. Defaults confirmed. Findings and chosen session design below. Nothing installed, migrated or run. |
| 1 | Draft exists; unverified and needs revision | `backend-phase-1` @ `544af29`. Revision plan below. No install/migration/runtime evidence. |
| 2–6 | Not implemented | Main remains a frontend prototype. |

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

**Latest change:** Claude completed Phase 0: owner confirmed the three defaults; consolidated handover committed on `backend-phase-1` (`544af29`); draft and installed Auth.js reviewed; session design and the fix list recorded above. Application code unchanged.

**Checks:** Source inspection only. Handover byte-identical to the owner's attached copy (md5 `bb05dd4e…`). No typecheck, tests, install, migration or server run. Historical test counts above are not a new run.

**Owner setup:** Google client pending; Resend/domain verification pending; AWS storage pending; hosting pending. No secrets belong here.

**Open decisions:** Codex/owner to accept the proposed Google linking policy (fix 3). Before Phase 4 confirm retention/access wording; before Phase 6 choose hosting/budget and approve final content.

**Next instruction for Codex (paste into Codex):**

> Review the head of `backend-phase-1` (Phase 0 docs commit after `544af29`) and the "Phase 0 reconciliation" section of `docs/handoff/PROJECT-HANDOVER.md` against the installed Auth.js source. Confirm or challenge the JWT plus `sessionVersion`/`UserSession` design, the Google linking policy and the Phase 1 fix list. Record your verdict in this file. No code changes.

**Next instruction for Claude (paste into Claude):**

> Implement Phase 1 on `backend-phase-1` following the Phase 0 reconciliation section and any Codex notes in `docs/handoff/PROJECT-HANDOVER.md`. Add dependency changes first, then give me one setup command at a time. Do not merge, push or deploy. Update the same file at the end.
