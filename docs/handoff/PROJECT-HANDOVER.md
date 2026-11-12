# Grace Abounds — Claude ↔ Codex handover

Updated: 13 November 2026 by Codex (consolidated role, UI and delivery plan). **This is the only project handover and backend plan.** Update this file in place; do not create backup handovers, separate progress files or dated reviews. Git preserves history. README files may describe components and link here, but must not duplicate the plan. Earlier handovers have been consolidated and removed.

## Current decisions — read first

**The decisions here and the revised delivery phases below are authoritative.** Dated proposals/review sections later in this file are historical evidence where they conflict. Read the active plan and relevant current slice, not every old instruction on each session. This update consolidates planning; it does not authorize implementation or claim planned functions already work.

- **Roles:** one fixed Admin and one fixed Pastor, both managing ordinary member accounts and church content. No routine staff-role assignment UI. Pastor alone receives prayer/appointment data and related statistics, and approves video publication. Member has Calendar/own bookings, Prayer, Appointments and Gallery; account/security utilities remain; messaging is shared future work.
- **Home:** one shared calendar-first surface. Remove For you, Your updates, Latest sermon, separate Sunday summary and duplicate activity-joining block. Staff tools live in a compact Home section, not a separate Manage landing stop. Full editors remain dedicated screens. Pastor statistics use real authorized database records only.
- **Calendar:** staff create/edit activities inside this app; the same records feed public pages, all role calendars and one-way public Google Calendar sync. App owns bookings/capacity/privacy. No two-way Google edits, invitations/roster sync or member Google-account requirement. Private appointments never enter the public calendar. Extra recurrence/membership/roster controls are deferred unless a concrete need is confirmed; do not silently discard existing data.
- **Saving:** content edits are drafts until an explicit Save; page arrays use Apply to page followed by page Save. No keystroke persistence, surprise reorder/delete writes or whole-draft promotion. Ordinary website saves publish immediately. Explicit member actions (Join, Cancel, Submit request) and administrative actions have their own confirmed API operation.
- **Video:** Admin/Pastor can prepare recordings, but only Pastor approves a saved, verified revision for member/public access. Applies to Gallery/direct media links/manual uploads, not only future OBS. Pending videos remain private; material replacement needs approval again. Media readiness and approval are independent.
- **Gallery:** Drive-style shared library on **Amazon S3 + CloudFront**, supporting documents, spreadsheets, presentations, images, audio, video and archives according to an explicit file-type/size policy. Staff upload/organize/edit/delete; members browse/open/download only. Use one asset store; approved sermons can appear in Gallery and public Sermons by reference. No Google Drive backend, collaborative document editor or crop/focal-point capability.
- **Website content:** retain six simple tabs, fixed hero headings/taglines, clearer section mapping, consistent saves, canonical links to Calendar/Videos/Gallery, revision/restore and a truthful live/draft preview distinction. Complete unfinished collection persistence. Public design/theme remains accepted apart from specific defects reported in screenshots.
- **Future features:** automated recording/OBS ingestion → processing → Pastor review → publication, and Messenger-style private chat, are deferred beyond the core launch. Prepare reusable backend contracts and security boundaries during core phases; do not build fake working screens or full unused services. Manual verified video upload and Pastor-approved publication remain core.
- **Execution:** Claude implements only after the owner authorizes the revised plan; Codex reviews slice checkpoints. Preserve the one handover, existing code and completed evidence. Owner runs installs/migrations/servers one command at a time. Do not run a production build against a running dev server sharing `.next`; coordinate stopping it or isolate build output. No merge/push/deploy without authorization.

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
- Record exact commands/results here so the next agent does not repeat completed investigation. Public Google calendar sync is required in revised Phase 3; defer personal/two-way sync and future OBS/subtitle enhancements.

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
- The AUT thesis covers sermon media processing only. Automated OBS ingest/processing and generated subtitles are future enhancements; Pastor approval remains human and required; ordinary CMS publishing stays immediate.

### Phase 1 defaults — confirmed by owner, 10 November 2026

The owner confirmed all three on 10 November 2026:

1. Email/password signup requires a password and email verification; Google/email-code signup needs no password and can add one later in Settings.
2. Password reset uses a six-digit emailed code, single-use and purpose-bound. Reset revokes all existing sessions and requires fresh sign-in.
3. Revise the existing Phase 1 draft and review the diff before merging.

Baseline code limits: 10-minute expiry, 5 requests/hour per normalized email and 5 wrong guesses/15 minutes; implement atomic limits plus per-IP abuse controls with trusted-proxy configuration, hashed challenges and non-enumerating responses. Tune IP thresholds for shared church networks. No passwords/codes in production logs. Development email codes may print locally only.

## Delivery phases and review gates — revised 13 November 2026

**Current position:** Phase 1 accepted for local-development progression; Phase 2 slice 1 site/page persistence and its published-state fixes accepted; editor-kit/theme checkpoint reviewed and pushed. Phase 2 is incomplete. Latest planning decisions are not yet implemented. Preserve completed auth, migrations, APIs and regression coverage; do not restart the project. Verify live git status/branch rather than relying on historical commit IDs.

Each slice includes its contracts, meaningful permission/data/failure tests, accurate frontend states and a short update here. Coded/verified/owner-accepted are separate statuses. Owner preview and Codex review occur at slice boundaries; do not repeat successful provider setup or unrelated full audits.

| Phase | Scope                                                                                       | Status                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Planning and frontend foundation                                                            | Completed baseline; revised product scope consolidated here. Owner approval of the revised implementation sequence pending.                                                            |
| 1     | Real identity/security/session foundation                                                   | Accepted locally. Fixed-staff/member-management permission migration is Phase 4; do not claim old Pastor-only role APIs already meet the new model.                                    |
| 2     | Simplified workspace shell, complete public CMS, content/library records, verified S3 files | In progress; slice 1 accepted. **2A complete at `fb2af2a` (Messages follow-up done; tests, lint and owner visual checks pass); awaiting brief closing checkpoint.** 2B–2D not started. |
| 3     | One connected calendar, capacity/bookings and public Google sync                            | Planned; required before full launch.                                                                                                                                                  |
| 4     | People management, private care/appointments and real role summaries                        | Planned.                                                                                                                                                                               |
| 5     | Core delivery/account lifecycle; future media/chat foundations                              | Planned. Video approval enforcement begins in Phase 2, not postponed to this phase.                                                                                                    |
| 6     | Staging acceptance, operational readiness and launch                                        | Planned; explicit production cutover approval required.                                                                                                                                |

### Phase 2 — finish the CMS and shared content foundation

**2A. Small navigation/Home cleanup and reported visual defects**

- Reuse the existing shell/editor kit/theme. Calendar-first Home; remove the five agreed clutter blocks. Move staff tool links onto Home and preserve old Manage deep links with a redirect. Keep the four member modules reachable through compact labelled entry points; preserve useful routes and do not strand existing public join links.
- This slice does not pretend to deliver Google sync, real care or dashboard statistics before their backend exists. Preserve honest unavailable/preview states; do not reintroduce demo-profile fallback. No extra widgets, features or new visual theme.
- Address the supplied screenshots as narrow defects, not a public redesign: (1) campus selector blank label caused by splitting `location.name` on an assumed em dash—use an explicit short label or safe full-name fallback; (2–3) group/study cards have two identical gold links with `margin-top:auto` on each—one spaced action group, clear primary Join and secondary See dates, consistent card alignment and responsive widths; (4) profile name is an `h2` but light-on-dark rule targets `h1`—correct semantic text colours and reduce excessive blank card height where layout stretch causes it; (5) login verse dots coexist with the decorative `aside:after` bar—remove redundant ornament and provide one clear, separated navigation indicator. The broad charcoal auth panel is a design choice, not by itself a defect; no recolour/removal without agreement. Check narrow widths before asserting screenshot crops prove horizontal overflow.
- **Exit:** desktop/narrow-mobile role Home and public Locations tabs/profile/login visual check, clear role navigation, no lost member feature, keyboard/focus checks and focused regression tests. Public paths/design unchanged apart from documented fixes.

**2B. Structured collections and uniform saves (original slice 2)**

- Move campuses, next-step journeys, leadership, resource metadata and sermon metadata from browser storage into resource-specific database models/APIs. Keep public page records already migrated. Use explicit per-record Save, versions/If-Match, validated field schemas, revisions/audit, archive and dependency-aware deletion. New items remain drafts until Save.
- Website tabs: map sections to public display, link Calendar service times/Videos/Gallery instead of duplicate editable copies; resources leave Site details for the library. Next steps CTAs point to an actual activity/appointment/interest action; generic duplicated application screens are not required.
- Define Asset/Resource/Sermon relationships and folders now. Separate descriptive resource metadata from source bytes; member-only/public visibility is explicit. Preserve fixed headings and the any-HTTPS browser-image policy.
- Implement **Pastor-only video publication authority now**, so no new sermon/gallery endpoint gives Admin a direct-publish bypass. Draft/pending/approved-version policy, approval/rejection feedback and reapproval on replacement are server-enforced. Production processing-ready checks are required when media is connected; no fake playable state.
- **Exit:** collection edits persist across browsers/restarts; unauthorized requests denied; rejected/stale saves retain input; no localStorage as the migrated source; unpublished/unapproved videos excluded from public and member responses. Published sitemap derives from records.

**2C. Revision history, preview and freshness (original slices 3–4)**

- Revision list and audited versioned restore. Keep ordinary page publishing immediate; no general approval queue.
- Clearly label View live page. Add bounded staff-only unsaved preview only when exact draft rendering/navigation is supported; do not leak the draft into the published provider. A complete preview is a later slice if it would block more essential persistence.
- Outbox-backed cache invalidation on save/restore; retain a safe no-store path until caching is verified. Never cache private responses publicly or lose existing open-browser freshness fixes.
- **Exit:** restore creates a new revision/audit entry; public content refreshes after saves/restores; unrelated drafts remain unsaved; private/draft data stays private.

**2D. S3 library and image/file management (original upload slice)**

- Owner provisions S3/CloudFront with guided reviewed configuration. Staff drag/drop prepares a queue; explicit Upload starts it. Verify objects, file type/size, safe download behavior and processing/quarantine status before availability. Support broad agreed file categories, not arbitrary executable inline content. Do not promise a preview for every file type.
- One library with folders/search/list or grid, staff-only management, member-only authorized download grants, safe metadata Save, confirmed recoverable removal and dependency checks. Public approved assets and private/pending/source files have distinct access policies.
- Image picker/thumb/replace/remove/order/alt text; no crop/focal controls. Align API/UI count limits (currently slideshow max 12, public photo strip max 24), safe zero/one/multiple-image rendering, stable placement IDs and broken-photo handling. Page display limits do not limit total S3 library files.
- Approved videos appear in Sermons/Gallery by asset reference, never duplicate uploads or an alternate publication switch. Pending/source video assets remain staff-only. Full FFmpeg jobs are Phase 5.
- **Exit:** staff upload/rename/organize/remove tested; Member upload/edit/delete denied; real protected file download works and expires; invalid files stay unavailable; image boundaries/failed loads/mobile rendering verified. No credentials in browser payloads.

### Phase 3 — connected calendar and participation

- One Home calendar with calendar/list views, a short staff Create/Edit panel and member activity details/Join/Cancel. Reuse one activity/occurrence model for public pages, all roles and Google. No separate competing Activities management workflow.
- Initial fields: title, short description, location, local start/end, optional supported simple repeat, joining enabled/optional capacity, explicit Save and publish/draft choice. Keep recurrence/cancellation safe; preserve existing record semantics while hiding unnecessary advanced options. No scheduled releases/ongoing membership/assignment editor in the basic form unless owner confirms a real need.
- Transactional capacity/duplicate booking rules, per-occurrence identity, timezone/DST, cancellation and basic staff roster. Members never edit schedules or another person's bookings.
- **Required Google sync:** one-way app → church public Calendar, stable mapping, create/update/cancel, retries/deduplication and staff sync status. Public event data only; no prayer, appointments, rosters or attendee invitations. App bookings and Google RSVP are not competing authorities. Basic .ics export remains; personal/two-way calendar sync deferred.
- **Exit:** create once → same event public/all roles/Google; change/cancel reflected; final-place concurrency admits one; duplicate retry safe; members cannot alter others; provider outage preserves saved event and exposes retry; DST/recurrence tested. Owner creates/shares the church calendar/service account when guided.

### Phase 4 — People, confidential care and role summaries

- Member list/search/detail from canonical users, not browser users. Both fixed staff accounts manage ordinary Member status/access under audited versioned operations; fixed staff protected. Deliberately remove/deny old role-promotion bypasses and coordinate controlled staff provisioning. Preserve existing identity/security locks and session revocation. No new identity framework.
- One Pastor-only care workspace with Prayer/Appointments views. Remove care records from People. Members submit/view only their own requests; Admin receives neither care records nor care statistics. Retention/access wording agreed before real confidential collection.
- Appointment request is distinct from confirmed slot. Pastor proposes/confirms time with conflict checks; private appointment overlay only to its member owner/Pastor, never public Google. Complete safe request/history/status UX.
- Pastor Home: compact real counts for accounts, published videos and prayer/appointment statuses, linking to filtered lists. No duplicated forms or invented numbers; media counts reflect approved/published records. Stats requiring unfinished jobs stay unavailable until connected.
- Messenger-style chat is explicitly deferred beyond the core launch. Prepare participant-based conversation/message contracts and reuse canonical users/private assets, but no live inbox/realtime service is required in Phase 4. Library access is already built in 2D and verified here across roles, not rebuilt.
- **Exit:** two real members plus Admin/Pastor tested; Admin cannot retrieve care via any endpoint/guessed ID/count; status changes revoke access; privacy-safe overlays; counts match persisted data; explicit saves and failure handling.

### Phase 5 — launch-required delivery/account lifecycle and future media foundations

- Complete manual verified upload → Pastor review → approved playback using the Asset/Sermon/revision policy from Phase 2. Publishing works without OBS automation; no claim that processing or ingestion is automatic. If serving the submitted recording directly, verify supported playback/type and readiness before review/publication.
- Prepare the media-worker job interface, source/output asset links, durable job states and outbox/idempotency/retry conventions; use the existing worker boundary. Full OBS ingestion, transcoding pipeline and automated publication handoff are Future F1 below, not a launch dependency. The AUT sermon-media thesis remains a separate future delivery milestone; this deferral does not redefine it as completed.
- Durable notification/email preferences and retry/provider states for actual core actions. Safe notifications omit confidential bodies. These are distinct from toasts and Messenger chat; no realtime service required now.
- Account export/deletion with recent auth, protected export grants, retention/audit and truthful queued/completed states. Reuse completed session/device revocation.
- **Exit:** real approved video upload/playback, unapproved video inaccessible even through Gallery/download IDs, Pastor-only exact-revision approval; retries for core jobs without duplicate effects; expired export denied; deletion revokes sessions. Future automation/chat contracts documented without reachable simulated features.

### Future F1 — automated sermon/video publishing

- Intended workflow: recording/OBS → authorized S3 source upload → durable background processing (FFmpeg when needed) → ready version awaiting Pastor review → explicit Pastor approval → publication to the existing Sermons/Gallery/public surfaces. Automation handles the pipeline, not approval. Admin cannot bypass approval by uploading/replacing through Gallery.
- Backend preparation in core phases: canonical source/output Asset and Sermon IDs, recording revision, processing state separate from approval/visibility, approver/reviewed revision audit, private pending assets, idempotency key/source ID, authenticated intake contract and retry/status interface. No new queues/vendors unless existing pg-boss/outbox cannot meet demonstrated requirements.
- Implement intake/worker integrations, resource/time bounds, provider setup and end-to-end failure/restart/retry tests in this future phase. Automatic captions/subtitles remain separately scoped. Preserve the approved live version while a replacement is pending.

### Future F2 — Messenger-style messaging

- This is private conversational chat, not an announcement board, email contact form or toast. Exact participant model (direct/member-to-staff/shared support), attachments, unread/read receipts and realtime delivery are finalized when work starts. All roles may use the feature, but this does not grant staff universal access to private conversations.
- Backend preparation now: document Conversation/ConversationParticipant/Message contracts around canonical User IDs, participant authorization, paginated message ordering, client message idempotency, sender from authenticated session, future read cursor and private attachment Asset references. Implement database migrations/routes when the feature slice is authorized; avoid unused infrastructure now. Reuse the authenticated gateway, audit/log privacy, rate limits and shared storage policy.
- No WebSocket/realtime vendor, typing indicators, push notifications, group-chat UI or simulated send success in the core phases. Hide the floating Messages shortcut, or show a clearly unavailable future-feature destination, until the connected service exists; remove prototype local chat records as a production data source.
- Future acceptance: persistent private conversations across devices, authorized participants only, bounded history, retry without duplicate messages, accurate sent/delivered/read meanings and protected attachment access. Messenger branding/integration is not requested—only a familiar interaction style.

### Phase 6 — staging, content and production launch

- Select hosts/budget and worker capacity, separate environments/secrets/buckets, deployment migrations, TLS/domain, monitoring, backup/isolated restore and rollback. Configure production Google OAuth/Resend/WebAuthn origins and sender settings; no repeated local signup setup.
- Complete all-role desktop/mobile/browser/accessibility journeys, source typechecks/lint/build and meaningful DB/contract/concurrency tests. Review actual church/bank/contact/legal copy and images; no seed claims or placeholder confidential data. Ensure site URL/sitemap reflect published records.
- **Exit:** demonstrably restored backup, owner-reviewed staging, no remaining fake success/localStorage for live business data, documented limitations and costs, explicit owner approval of production cutover. Push/merge is not deployment acceptance.

**Immediate next step:** owner reviews this revised plan. Claude must not start an older slice instruction. On authorization, begin only 2A, obtain owner visual acceptance and a focused Codex checkpoint, then 2B–2D. Keep one branch/slice review boundary, preserve completed work and do not implement all phases at once.

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
- [ ] Core uploads/downloads, approved video playback and core notifications verified; future automation/chat are not advertised as working. When Future F1/F2 are implemented, verify their processing/delivery across restarts and failures.
- [ ] Permissions, confidentiality, stale writes, DST, booking concurrency and retries covered by meaningful tests.
- [ ] Church/contact/bank/social/legal details approved; retention and deletion behavior agreed before real confidential data.
- [ ] Separate environment secrets/data; deployment migrations, restore exercise, monitoring, rollback and operational owner documented here.
- [ ] Owner has reviewed staging and approved production cutover.

## Live status — update in place after every session

| Phase | Status                                                                        | Evidence / blocker                                                                                     |
| ----- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0     | Complete — accepted by Codex                                                  | Source review, defaults confirmed, session design below.                                               |
| 1     | Complete — accepted by Codex (12 Nov; `backend-phase-1` tip `37f0050` pushed) | Local-development acceptance, not a production sign-off. See "Codex checkpoint and return to Phase 2". |
| 2     | Historical row; see the revised phase table at the top of this file           | 2A checkpoint at `5854084` (see "Phase 2A checkpoint").                                                |
| 3–6   | Not implemented                                                               | —                                                                                                      |

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

### Phase 2 — inventory and slice plan (Claude, 12 November 2026)

**Branch:** `backend-phase-2` created from the reviewed Phase 1 tip `37f0050` (clean worktree; `main` untouched; nothing pushed).

**Current browser-storage boundary.** `components/content-provider.tsx` keeps one `ContentState` object in `localStorage` key `grace-abounds-content-v4`, seeded from `lib/content.ts` and `lib/page-content.ts`. Twenty-seven client components read it with `useContent()`; the CMS (`admin/cms/page.tsx`) writes it on every keystroke ("changes go live as you type"). Phase 2 owns `site`, `pages`, `team`, `sermons` (metadata) and `pages.resources`. `activities`/`participations` are Phase 3. `messages`, `users`, `appointmentRequests`, `participationApplications`, `serviceAssignments` and `memberPrayerRequests` are Phase 4; they stay in browser storage until then and are never sent to or from the public content API.

**Field inventory (CMS tab → field → target resource).**

| CMS tab / page               | Fields today                                                                                                                               | Target                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Shared (all pages)           | `contactEmail`, `contactPhone`, `contactAddress`, `footerAddress`, `facebookUrl`, `instagramUrl`, `youtubeUrl`, `authVerses` (text, `quote | ref` per line)                                                                                        | `SiteSettings` (singleton) — **slice 1** |
| Giving (shared bank details) | `givingAccount`, `givingBank`, `givingNumber`                                                                                              | `SiteSettings.giving` — **slice 1**                                                                   |
| Home `/`                     | `heroEyebrow`, `heroTitle`, `heroAccent`, `heroCopy`, `homeVerseText`, `homeVerseReference`, `heroImages[]`, `gallery[]`                   | `PageContent['home']` — **slice 1** (image URLs/paths now; asset references in the uploads slice)     |
| About `/about`               | `story`, `aboutIntro`, `aboutHeroImage`, `aboutImage`, `ministryYears`, `values[[no,title,body]]`, `officeHours`                           | `PageContent['about']`; `values` become named objects — **slice 1**                                   |
| About → Leadership           | `team[]` (`name, role, bio, image, status`)                                                                                                | `TeamMember` collection — slice 2                                                                     |
| Locations `/location`        | page intro (`heroes['/location']`), `locations[]` (`id, name, address, type, image`)                                                       | intro → `PageContent['location']` slice 1; `Location` collection (referenced by activities) — slice 2 |
| Next steps `/next-steps`     | intro, `steps[]` (`icon, title, subtitle, heading, body, cta, memberHref, path[]`)                                                         | intro slice 1; `NextStep` collection with stable ids — slice 2                                        |
| Giving `/give`               | intro, `givingVerseText/Reference`, `givingImpact[[pct,title,body]]`                                                                       | `PageContent['give']` (named objects) — slice 1                                                       |
| Events `/events`             | intro                                                                                                                                      | `PageContent['events']` — slice 1 (activities are Phase 3)                                            |
| Sermons `/sermons`           | intro; sermon library is `/admin/sermons`                                                                                                  | intro slice 1; `Sermon` metadata collection — slice 2; media processing — Phase 5                     |
| Shared → resources           | `resources[]` (`id, title, type, url, description`)                                                                                        | `Resource` collection with access class — slice 2/uploads                                             |

Every positional tuple becomes named fields at the API boundary. Page keys: `home`, `about`, `location`, `next-steps`, `give`, `events`, `sermons` (the CMS "Shared" tab is `SiteSettings`).

**Schema (slice 1).** `SiteSettings` (`id='site'`, `data` JSON, `version`, `updatedAt`, `updatedById`); `PageContent` (`key` PK, `data` JSON, `version`, …); `ContentRevision` (`entityType`, `entityKey`, `version`, `data`, `actorId`, `restoredFromId?`, `createdAt`), written in the same transaction as each save, together with an `AuditEvent`. JSON is validated by per-key Zod schemas in `@grace-abounds/validation` (shared by API and website; currently an empty placeholder package), so no unrestricted blob.

**Contracts (slice 1).** `GET /v1/public/site`, `GET /v1/public/pages/:pageKey` and a bundle `GET /v1/public/content` (site + 7 pages, for the server-rendered layout); `GET/PATCH /v1/staff/site`, `GET/PATCH /v1/staff/pages/:pageKey` (Pastor/Admin; `If-Match` → `412 VERSION_CONFLICT`; `422` field errors; responses `{ data, version }`, private `no-store`). Public responses contain only published content and no staff metadata.

**Publishing and UI.** Saving publishes immediately (no approval workflow, as decided). Because per-keystroke saving cannot work with version checks or two editors, each CMS tab gets one **Save** button with explicit "Unsaved changes / Saving… / Published / Failed — retry" states. Conflicts keep the editor's text and offer reload. Success toast only after the server confirms. Layout and theme unchanged.

**Rendering.** The root layout fetches the public bundle server-side and passes it to `ContentProvider` as initial content, so public pages render real content without a seed flash or localStorage. `cache: 'no-store'` in slice 1 (always fresh); tag-based caching with invalidation on save/restore is the cache slice.

**Seed and import.** Default content moves into the validation package. An explicit `content:seed` command writes it to an **empty** development database only; app startup never writes content. Browser-only edits in `grace-abounds-content-v4` are trial data and are **not** imported (no production import exists); after slice 1 the provider ignores the stored `site`/`pages` and keeps only the not-yet-migrated parts.

**Slices:** (1) settings + seven pages, persistence, immediate publishing, revisions written; (2) structured collections — locations, next steps, team, resources, sermon metadata — and sitemap from published records; (3) revision history + audited restore; (4) cache tags + invalidation through the outbox; (5) verified uploads (images/avatars) once a storage provider is chosen. Each slice: migration, contracts, adapters, permissions, toasts and failure states, focused tests, handover update.

**Storage decision (pending owner).** Current list prices (checked 12 Nov 2026; verify at provisioning): Cloudflare R2 Standard $0.015/GB-month, free egress, 10 GB/1M writes/10M reads free monthly. Amazon S3 Standard about $0.023–0.025/GB-month (Sydney/Auckland list price to confirm), plus CloudFront for delivery: 1 TB/month always free, then about $0.114/GB in AU/NZ; flat-rate CloudFront plans from $0/month (100 GB) or $15/month (50 TB). For a church posting one 45-minute sermon a week (about 1 GB of processed video, ~50–100 GB a year) and a few hundred GB of monthly viewing, both cost single-digit dollars a month; the differences are egress beyond 1 TB (R2 free) versus staying with the AWS account, IAM and region choice already planned (S3/CloudFront, possibly the Auckland region). DB/CMS slices 1–4 do not depend on this choice.

### Phase 2 slice 1 — implementation and verification (Claude, 12 November 2026)

**Owner decisions (12 Nov):** storage = **Amazon S3 + CloudFront** (not R2); this supersedes "Storage decision (pending owner)" above. CMS save model = **one Save button per tab**, publishing immediately ("Unsaved changes / Saving… / Published / Failed"). **Photo links:** until uploads exist, a photo may be any `https://` link or a `/images/…` path (owner accepted the trade-offs: the other site can break or block the photo and sees visitors' requests).

**Commits on `backend-phase-2` (from `37f0050`):**

| Commit    | What                                                                                                                                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ba9ab78` | Inventory, contracts, slice plan, storage comparison (section above).                                                                                                                                                                                                                           |
| `9276d1a` | Slice 1: shared Zod schemas + seed defaults (`packages/validation`); `SiteSettings`, `PageContent`, `ContentRevision`; `content:seed`; content API routes; server-fetched public bundle in the root layout; adapter to the existing components; CMS Save.                                       |
| `f0c54aa` | `phase2_content` migration (owner-generated with `prisma migrate dev`).                                                                                                                                                                                                                         |
| `2f87c73` | Next could not resolve `./content.js` in the workspace package: `.ts` relative imports (as `packages/database`), `rewriteRelativeImportExtensions` for the package build, package added to `transpilePackages`.                                                                                 |
| `2db5b56` | Server image rule tightened to what the site could display (interim; superseded by the next commit).                                                                                                                                                                                            |
| `7c79478` | Owner decision on photo links: one shared `isImageRef` (https or `/images/`) used by the API schema, CMS warnings and activities. `SiteImage` renders other hosts `unoptimized`, so the Next image server still fetches only from the configured hosts. CMS photo preview reports load failure. |
| `e177359` | `SiteImage` passes `alt` explicitly (jsx-a11y lint).                                                                                                                                                                                                                                            |

**What slice 1 does.**

- `GET /v1/public/content` (site + 7 pages; 503 `CONTENT_UNAVAILABLE` if any row is missing), `/v1/public/site`, `/v1/public/pages/:pageKey` (404 unknown key). Published data only, no editor metadata, `no-store`.
- `GET/PATCH /v1/staff/site` and `/v1/staff/pages/:pageKey`, Pastor/Admin only. PATCH requires `If-Match` (428 if missing, 412 `VERSION_CONFLICT` if stale), validates with the strict per-key schema (422 with `fieldErrors`), then in one transaction: conditional `updateMany` on the version, `ContentRevision` at the new version, `AuditEvent` (`content.site_published` / `content.page_published`). Response `{ data, version }`, ETag, `private, no-store`.
- The root layout fetches the bundle server-side (`cache: 'no-store'`). If it fails, the provider exposes `contentUnavailable` and shows no demo content. Browser storage no longer supplies `site`/`pages`; it keeps only `locations`, `steps`, `resources`, `team` and the Phase 3/4 data until slice 2. The retired editor key is removed, never applied.
- CMS: loads all eight resources with versions and saves only the dirty resources for the current tab. Toasts appear only after the server confirms. A stale save keeps the edits and offers "Load latest (discards your unsaved edits)". 422 errors are listed by field, partial publishes name what was and wasn't published, and a warning appears on leaving with unsaved changes. Browser-only collections are labelled as such.

**Evidence (owner's Mac, 12 Nov).**

- `pnpm test:db`: **10 files, 83 tests passed**. `apps/api/src/content.test.ts` covers 503 before seeding, public bundle without metadata, guest 401 / member 403 / Admin + Pastor allowed, save → version 2 + ETag + public update + revision with actor + audit row, 412/428/422 leave the version unchanged, and concurrent saves → exactly one 200 + one 412 with one revision.
- `pnpm test`: **16 files, 53 passed** (75 DB tests skipped as designed). Covers the schema tests (https/`/images/` accepted; `http:`, `javascript:`, `data:`, other site paths and whitespace rejected), the `canOptimize` test and the provider tests (published content wins over stale localStorage, local collections persist, null bundle → unavailable).
- `pnpm lint` (ESLint `--max-warnings=0` + full Prettier) and `pnpm build` pass. Typecheck of validation, database, api and web source also passes.
- Owner browser checks:
  - Edit + Save in the CMS → **Published**, live on the home page.
  - Same content seen in **Safari and Firefox** (never used the CMS).
  - Still there after stopping and restarting `pnpm dev`.
  - Two tabs: the stale tab's Save is rejected with the conflict message, its edits are kept, and the public page shows the first save.
  - A newly signed-up member cannot reach `/admin/cms`.
  - An external https photo link saves and displays.

**For Codex to check.**

1. The image policy change (`7c79478`): hotlinked photos are a deliberate owner trade-off. Confirm that the `unoptimized` path and the unchanged `remotePatterns` keep the Next image optimiser from becoming an open fetcher. Profile avatars keep their own stricter `safeAvatar` host list.
2. The public bundle is fetched per request with no caching until slice 4, which is acceptable for local development.
3. `content-defaults.ts` holds placeholder bank details and is used only by `content:seed`, which refuses to run in production and never overwrites rows. It is never a runtime fallback.

**Known limits (by plan, not defects):** locations, next steps, leadership, resources and sermon metadata are still browser-only (slice 2). There is no revision history UI or restore yet (slice 3), no cache tags (slice 4), and no uploads (slice 5, S3 + CloudFront; AWS provisioning will be guided step by step when reached). Phase 2 is **not** complete.

**Current next instruction:**

> Codex: focused review of `37f0050..e177359` on `backend-phase-2` (slice 1 and the photo-link decision). Claude: after review, address findings, then slice 2 (structured collections with the same Save/version/revision/audit pattern and server-side image validation). No merge, push or deployment without authorization.

### Codex Phase 2 slice 1 review — 12 November 2026, head `f19532e`

**Verdict: changes requested before slice 2.** Server resource boundaries, strict schemas, transactional version/revision/audit writes and explicit seeding were reviewed. The owner-approved any-HTTPS photo policy is respected: `SiteImage` uses `unoptimized` for other hosts and `remotePatterns` remains restricted to the two trusted hosts. No arbitrary server-side photo fetching was introduced. Keep this boundary when adding uploads/collections. No blanket production or full Phase 2 acceptance implied.

**[P2] Only merge confirmed resource responses into published state.** `apps/web/app/admin/cms/page.tsx:546–550` calls `applyPublished` with the entire `draft.site` and every server-backed page field on success, and even on partial failure. Reproduce: edit Home without saving, switch to About, edit/save About, then follow “View the live site” in the same SPA session. The provider has received the unsaved Home edit even though the database/public response has not. A Giving save that succeeds for `give` but fails for `site` similarly displays the rejected bank details in this browser. Apply only the successful API response for each resource to the published snapshot, using the canonical returned (trimmed/validated) data. Never promote other drafts or failed resources. Retain their dirty states. Add a CMS-level regression for cross-tab unsaved edits and partial success/failure; assert the public/provider snapshot, not only toast wording.

**[P2] Synchronize server-published content after refresh.** `apps/web/app/components/content-provider.tsx:92–98` initializes `published` and `content` once from `initialContent`; later server prop updates are ignored. The root layout is persistent across client navigation; `cache: no-store` on its fetch alone does not refresh this client state. Even a router refresh delivering a new bundle cannot replace the initial useState snapshot, and `contentUnavailable` may say recovered while fields remain empty. Reconcile the migrated site/page fields when fresh initialContent arrives, without clobbering local collections or CMS unsaved drafts, and establish a simple explicit freshness path (refresh when returning to public content or on focus as appropriate; no realtime service needed). Add a rerender test for bundle A → B and unavailable → valid, preserving browser-only collections. Verify navigating in an already-open browser after another browser publishes, not only loading a fresh tab.

**Checks:** Codex ran the focused image/schema/provider suites: 3 files, **9 passed**. Existing owner evidence for 83 DB tests, 53 regular tests, lint/build and five browser checks is acknowledged, not repeated. Those checks do not currently cover the two client-state cases above. No application code changed in this review; handover updated only. No push/merge/deployment.

**Current instruction for Claude (supersedes earlier slice 2 start instruction):** Fix the two published-state findings above with focused CMS/provider regression tests. Keep the accepted HTTPS policy and server image allowlist unchanged. Reuse adapters and resource-specific responses; avoid another broad audit or architecture change. Run affected checks, record exact evidence here and return slice 1 for a short Codex checkpoint before slice 2. No merge, push or deployment. Storage remains Amazon S3 + CloudFront as confirmed by the owner.

### Claude response to Codex slice 1 review — 12 November 2026, head `2840461`

Both findings were fixed in `2840461`, and the photo policy is unchanged: `SiteImage` and `isImageRef` were not touched, and `remotePatterns` still lists only the two trusted hosts.

**[P2] Only confirmed resources are published.**

- `lib/content-adapter.ts` now converts one resource at a time:
  - `resourceToLegacy(resource, data)` returns a `PublishedPatch` of site fields, page fields and the page's hero.
  - `mergePatch` merges a patch, including into `pages.heroes`.
  - `toLegacy` is built from the same helpers.
- In `admin/cms/page.tsx`, each successful PATCH applies its own response `data` (canonical, server-parsed) to the provider with `applyPublished(patch)`, and to the draft. It also clears that resource's dirty flag.
- The whole-draft `applyPublished` calls are gone, including the one on the partial-failure path. Unsaved edits on other tabs and resources that failed are never promoted, and they stay dirty.
- `applyPublished` now accepts only a `PublishedPatch`.

**[P2] Fresh server content reaches an open browser.**

- In `content-provider.tsx`, `published` is derived from the current `initialContent`, keyed by its JSON value. When a new bundle arrives after the first load:
  - Only the server-owned `site` and page fields are replaced.
  - `locations`, `steps` and `resources` (browser-only for now) and the rest of the local data are kept.
  - CMS drafts are untouched, because they live in CMS component state.
- If a later refresh returns no bundle, the last published content stays on screen. `contentUnavailable` is true only if nothing published has ever been shown.
- New `components/content-freshness.tsx`, mounted in `Providers`, calls `router.refresh()`:
  - when the visitor moves to a public page (`/`, `/about`, `/location`, `/next-steps`, `/give`, `/events`, `/sermons`, `/events/*`, `/sermons/*`), not on the first render;
  - when the tab becomes visible again.
- Workspaces and the CMS don't refresh on navigation. No realtime service was added.

**Regression tests (new):**

- `admin/cms/page.test.tsx`, run against the real provider, with fetch stubbed so it returns schema-parsed data like the API:
  - An unsaved Home edit, then an About save: only `about` is PATCHed. The provider holds the canonical trimmed story and the published Home title, and Home stays marked dirty.
  - On the Giving tab, `give` returns 200 and `site` returns 422: the provider gets the new verse but keeps the published bank. The rejected bank stays in the field, the tab stays dirty, and the partial-publish message is shown.
- `content-provider.test.tsx`:
  - A rerender from bundle A to bundle B updates the title, bank and Events hero, and keeps a browser-only `locations` change.
  - Rerenders go from unavailable to valid (recovered, fields filled) and then to null (last content kept).
- `content-freshness.test.tsx`: a refresh happens on a public navigation, not on the first render or `/admin/cms`, and happens on returning to the tab.

**Evidence (owner's Mac, 12 Nov):**

- `pnpm test`: **18 files, 60 passed** (75 DB tests skipped as designed).
- `pnpm lint` (ESLint `--max-warnings=0` + full Prettier) and `pnpm build` pass.
- `pnpm test:db` was not re-run, because no API or database code changed since the recorded 83/83.
- Owner browser checks:
  - An already-open Safari tab, never refreshed, showed a heading published from the other browser after moving About → Home.
  - With an unsaved Home edit, saving About and opening the live site showed the new About content and the old Home heading.

**Current next instruction:**

> Codex: short checkpoint of `f19532e..2840461` (published-state fixes and tests). Claude: on acceptance, start slice 2 (structured collections: locations, next steps, team, resources, sermon metadata, with the same Save, version, revision and audit pattern, server-side image validation using `isImageRef`, and a sitemap from published records). No merge, push or deployment without authorization.

### Workspace UI redesign — owner decision and plan (Claude, 12 November 2026)

**Owner decision (12 Nov):** the signed-in workspace (Member, Admin and Pastor) gets one consistent, decluttered editor look. **This supersedes "No further UI redesign is planned for Phase 2"** in the Codex checkpoint above.

The owner found the current CMS too complicated:

- Admins could edit page headings and taglines.
- Long expanded lists made pages very long.
- Every staff page looked different.

The plan was agreed through a clickable mockup (the owner's private "Staff Editor Mockup", four screens) and a decision sheet ("Staff Editor Redesign Plan").

**Scope: UI only.** What each page does, the data and the API contracts stay the same. There is one exception: page headings and taglines become **Pastor-only**, and the API enforces this too (Admin gets 403 on those fields). The public website is not redesigned; it only stops showing Admin-edited headings.

**Agreed design.**

1. **Navigation:** a slim icon sidebar holding only Home, Manage (staff only) and Settings, collapsed by default as today. Messages moves out of the sidebar into the floating bottom-right button on every workspace screen.
2. **Manage hub:** "Manage" opens a page of large tiles, each with a coloured top panel and a large icon. The tiles are Website content, Activities & calendar, Sermons, Members & roles and Pastoral care, each shown only to roles allowed to use it. Inside a tool, a "← Manage" link replaces the second menu.
3. **One editor kit (shared components):**
   - Page header: title, one line and the main action.
   - Section card: icon and plain-English title.
   - List row: photo or icon, name, one detail line, a Live/Draft badge and a single **Edit** button. A drag handle appears on hover.
   - **Side panel** from the right (owner chose option A): the item's fields with Cancel and Save. **Remove sits inside the panel and asks for confirmation first.** The panel is full screen on phones.
   - Fields: short text, long text, photo (thumbnail plus Change), link, date/time, choice and on/off.
   - Feedback: save status ("Unsaved changes / Saving… / Published"), a sticky "Unsaved changes · Discard · Save and publish" bar for page fields, empty states, and a confirm dialog.
4. **Website content:**
   - Page tabs (Home, About, Locations, Next steps, Giving, Site details) shown as an underline row, with "View page".
   - The Events and Sermons tabs are removed: they only held hero copy, and those items are managed in their own tools.
   - Hero eyebrow, title and tagline go into a collapsed **"Advanced: page heading · Pastor only"** section that Admins never see.
   - Lists (values, leadership, campuses, steps, giving areas, resources) use list rows and the side panel. Each item saves on its own, which fits the slice 2 per-record API.
5. **Home:** welcome, a slim "This Sunday" strip, a calendar with day dots and a day list, Your updates, Latest sermon, and "For you" cards (Request an appointment, Prayer request and Take a next step open the side panel; Resource gallery is a link). The "Pastor/Admin tools" buttons are removed because the Manage hub replaces them.
6. **Icons:** Lucide (`lucide-react` is already a dependency of `apps/web`; nothing to install).

**Role visibility (permissions unchanged; the server stays the authority):**

|                                | Member         | Admin                  | Pastor                    |
| ------------------------------ | -------------- | ---------------------- | ------------------------- |
| Sidebar                        | Home, Settings | Home, Manage, Settings | Home, Manage, Settings    |
| Messages floater, Home         | ✓              | ✓                      | ✓                         |
| Manage hub                     | —              | ✓                      | ✓                         |
| Website content                | —              | ✓, no Advanced         | ✓, with Advanced headings |
| Activities & calendar, Sermons | —              | ✓                      | ✓                         |
| Members & roles                | —              | view only (as now)     | role changes (as now)     |
| Pastoral care                  | —              | —                      | ✓                         |

**Constraints for the build:**

- Keep the accepted theme and the mobile drawer behaviour.
- Every new colour goes into `theme.css` as a palette token plus a site token, with light and dark values; `theme.test.ts` must stay green. The mockup's tile tints (blue, purple, green, soft red) need new tokens.
- Accessibility:
  - real buttons and links, labelled icon buttons, `role="dialog"` with focus trapped and returned on close, and Escape to close the panel;
  - text contrast of at least 4.5:1 in both themes;
  - drag-to-reorder has a keyboard alternative (Move up/Move down inside the panel or the row menu).
- Truthful toasts and the existing version, conflict and partial-failure behaviour are preserved.
- Existing tests keep passing, and new component tests cover the panel, the confirm-before-remove step and role visibility.

**Build order (small, reviewable commits, each with tests and owner browser checks):**

| Step | Work                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Editor kit components and theme tokens.                                                                                                                                      |
| 2    | Slim sidebar, Manage hub and Messages floater for all roles.                                                                                                                 |
| 3    | Website content rebuilt on the kit for the slice 1 data. Pastor-only headings: an API field rule with tests (Admin PATCH changing any hero field gets 403; Pastor succeeds). |
| 4    | Slice 2 collections (locations, next steps, team, resources, sermon metadata) built directly as list rows + panel on per-record endpoints.                                   |
| 5    | Activities & calendar, Sermons, Members & roles and Pastoral care moved onto the kit (UI only).                                                                              |
| 6    | Home.                                                                                                                                                                        |

Steps 3–4 continue Phase 2. Step 5 is UI-only work on Phase 3/4 screens whose data is still in the browser.

**Current next instruction:**

> Codex: (1) short checkpoint of `f19532e..2840461` (slice 1 published-state fixes), and (2) review this redesign plan for risks: role visibility, the Pastor-only heading rule, accessibility and the theme-token approach. Claude: after Codex's checkpoint, start build step 1. No merge, push or deployment without authorization.

### Owner-approved redesign refinements and Codex checkpoint — 12 November 2026

**This section supersedes the earlier Pastor-only Advanced heading editor and build-order instructions.** The owner confirmed: page headings are fixed and not editable, and accepted Codex review suggestions 2–6. Claude should implement the bounded refinement below, then continue the existing backend phases. No second handover or redesign plan file.

**Slice 1 checkpoint:** Codex reviewed `2840461`: saves now merge only confirmed canonical resource patches, and incoming server content reconciles into published state without replacing local collections/CMS drafts. Focused CMS/provider/freshness regression suites were run by Codex: **13 passed across 3 files**. Slice 1 may progress to slice 2; historical DB, build and browser evidence remains as recorded. This does not mark all Phase 2 complete.

**1. Fixed page headings, for every role.** Remove the proposed "Advanced: page heading · Pastor only" editor entirely. Neither Admin nor Pastor can edit the public page hero identity/copy through the CMS. Treat the shared hero fields (`eyebrow`, `title`, `accent`, `copy`, including the tagline/introduction in that hero) as fixed presentation copy. This applies to Home and every existing public-page hero; map the exact existing fields before changing the editor. Also keep workspace/tool headings fixed. This does not freeze editable content-record titles (sermon title, resource name, event title), stories, body descriptions, verses or ordinary editorial text.

Preserve the currently published heading text; do not reset it to seed placeholders, overwrite the database or silently change church copy. A destructive migration or new heading-management system is unnecessary. During this transition existing versioned documents may retain their stored hero fields: allow unchanged protected values in full-document saves, reject actual attempts to change them for **both** staff roles, and provide a clear error. Do not accept a role-based bypass or rely solely on hidden fields. Future fixed-copy changes are deliberate source/release work, outside the CMS. Tests: ordinary Admin/Pastor content saves still work with unchanged hero fields; altered protected fields are refused without revision/version/audit side effects. Document any existing page-intro field that is actually body content rather than a hero so it stays editable consistently.

**2. No lost destinations.** Events and Sermons hero-only CMS tabs can disappear now that their hero copy is fixed. Their management tools retain all actual editorial operations. Any remaining editable non-heading page introduction belongs in the corresponding tool; do not strand a field by removing its tab. Include a short old-destination → new-destination mapping here. Preserve existing deep links or add appropriate redirects.

**3. Save boundaries match the API.** Slice 2 relational collections use per-record endpoints/version checks and independent panel saves. Existing JSON page arrays (values, giving areas, image galleries) remain part of the page draft: a panel's action says "Apply to page" and closing it does not claim publication; the page-level "Save and publish" commits the versioned page. Clearly distinguish Cancel/discard of panel edits from discarding the entire page draft. No per-item publication claims unless an actual independent backend contract exists. Preserve server-confirmed toasts, partial failures, dirty-resource isolation and canonical response handling from slice 1.

**4. Safe panel dismissal.** Define dirty-state behavior for Cancel, Escape, backdrop click, opening another record, changing tabs and route navigation. Offer Keep editing / Discard when an action would lose panel edits; no silent loss. A clean panel closes normally and returns focus to its trigger; Escape first closes the topmost confirmation dialog. Save/validation/network/version-conflict failures retain input with an inline recovery path. Prevent duplicate submissions while saving. Add focused keyboard, dismissal, failure and confirmation tests.

**5. Discoverable member navigation.** A slim Home/Manage/Settings sidebar is acceptable only with clearly labelled, stable routes to Calendar, Resources, Messages, Help and the public website. Retain Calendar/Resources/Help as compact navigation items or a consistently accessible labelled secondary menu rather than burying them solely in Home cards. No hover-only access on touch screens. Member has no Manage entry; staff retain personal member features. Admin's read-only destination/tile is labelled **Member directory**; Pastor may have Members & roles. Pastor-only care remains inaccessible to Admin at the server boundary. Reuse the existing Messages shortcut with accessible labels; do not manufacture unread counts.

**6. Bounded delivery and return to phases.** First build the shared editor kit, fixed-heading rule and minimal Manage navigation needed for Phase 2; then build slice 2 collections directly on that kit. Do not rebuild Activities, member administration or pastoral-care workflows while their data is still browser-only. Move those tools onto the kit when Phases 3/4 connect them to their real backend. Reuse current Home and the repaired calendar layout; defer the larger Home composition to the appropriate member-workspace phase unless a small navigation/accessibility correction is required now. This reduces repeated implementation and credit use.

**Acceptance:** preserve the approved yellow/neutral light/dark theme and colour tokens; no public-site visual redesign. Editor kit/panel and navigation must work on desktop and narrow mobile with keyboard, visible focus, focus trapping/return and safe modal stacking. Maintain immediate publishing and version/ownership checks. Owner reviews the first usable editor before the kit is rolled across all Phase 2 collections. Run affected tests as slices complete; do not repeat provider/auth audits or full suites without relevant changes. End each slice by updating this file with real evidence and returning a focused diff for Codex review. No merge, push or deployment without authorization.

**Current instruction to paste into Claude:**

> Read "Owner-approved redesign refinements and Codex checkpoint" at the bottom of PROJECT-HANDOVER.md. The owner has approved these refinements: headings/hero taglines are fixed for everyone, not Pastor-editable; apply the other five review suggestions. Slice 1's published-state checkpoint passed. Implement the shared editor kit and bounded Phase 2 navigation/fixed-heading work, preserving current published copy and existing backend contracts. Keep per-page versus per-record save semantics explicit, protect dirty panel edits and keep member destinations discoverable. Show me the first usable editor before rolling it across collections. Then continue Phase 2 slice 2 and subsequent existing slices; defer Phase 3/4 screen rebuilds and the larger Home redesign to those phases. Keep the accepted theme, update this sole handover with checks and request focused Codex review at slice checkpoints. No merge, push or deployment.

### Redesign checkpoint — Claude, 12 November 2026, head `45a038f`

Implements "Owner-approved redesign refinements and Codex checkpoint". Owner review led to further UI-only refinements, all recorded below as owner decisions.

**Commits (`ae13e6c..45a038f`):**

| Commit    | Change                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------- |
| `26e83ef` | API: page headings fixed for every staff role                                                     |
| `72cb51e` | Editor kit, Manage hub, Website content rebuilt on the kit                                        |
| `4f92790` | Owner refinements: top bar, sidebar toggle, hub layout, icon-only Messages, Home "For you" panels |
| `45a038f` | Owner decision: staff reach Calendar and Resources from Manage                                    |

**1. Fixed headings (API, `routes/content.ts`).**

- Every page's `hero` (`eyebrow`, `title`, `accent`, `copy`) is fixed copy. This covers the Home hero, including its tagline, and the location, next-steps, give, events and sermons heroes.
- Inside the save transaction, the API reads the stored row and checks the version (412 if stale). It then compares the four hero fields, trimmed, and refuses any change with `422 FIXED_CONTENT` and per-field `fieldErrors`. This applies to Admin and Pastor alike, with no role bypass.
- Unchanged stored values in full-document saves are accepted. Stored copy is untouched: there is no migration and no reseed.
- Test `page headings are fixed for every staff role, with no side effects`:
  - Admin and Pastor: an altered Home title and an altered Events tagline both give 422 with the right field.
  - Versions stay at 1, there are zero revisions, and there are zero publish audits.
  - A Pastor save with an unchanged hero gives 200.
  - The existing tests now edit the verse rather than the heading.
- **Still editable** (body content, not hero):
  - About `intro` ("Intro paragraph") and `story` ("History")
  - About values, office hours and years of ministry
  - Home and Giving verses, Home photos and gallery, giving areas
  - all Site details
  - next-step records' own `heading`/`body` (record content)
  - campus, leadership and resource records

**2. No lost destinations.** Old → new:

| Old location                                                                                                      | New location                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| CMS Events tab                                                                                                    | Removed; it held only hero copy, now fixed. Activities editing: Manage → **Activities** (`/admin/events`, unchanged route). |
| CMS Sermons tab                                                                                                   | Removed (hero only). Sermon editing: Manage → **Sermons** (`/admin/sermons`).                                               |
| CMS "Shared" tab                                                                                                  | Renamed **Site details**.                                                                                                   |
| Sidebar: Website content, Activities & calendar, Manage sermons, Members & roles / Member activity, Pastoral care | Manage hub `/admin/manage`. All routes are unchanged, so deep links still work.                                             |
| Locations tab                                                                                                     | Links to `/admin/events` for service times.                                                                                 |

CMS tabs were never URL-addressed, so no redirects were needed.

**3. Save boundaries.**

- Page documents: fields edit the draft. List panels (values, giving areas, slideshow and gallery photos, sign-in verses) say **Apply to page**, with the note "Applies to this page’s draft. Select Save and publish to put it live."
- A sticky bar offers **Discard** (confirmation: "Discard unsaved changes on this page?") or **Save and publish**. Discard restores each changed resource from the last confirmed server data.
- Saving keeps slice 1's behaviour: canonical per-resource patches, dirty-resource isolation, partial-failure messages and conflict recovery.
- Campuses, steps, leadership and resources still save in this browser, labelled "Save in this browser", until slice 2 gives them per-record endpoints.

**4. Panel dismissal (`components/editor-kit/side-panel.tsx`, `use-layer.ts`).**

- Cancel, Escape, the backdrop and the close button share one path. A clean panel closes and focus returns to its trigger. A dirty panel opens "Discard your changes?" (**Keep editing** / **Discard**).
- Escape and Tab belong to the topmost layer only, so Escape closes the confirmation first.
- Nothing closes while busy. `beforeunload` warns while a dirty panel is open.
- Opening another record or changing tabs is impossible while the modal is open (the backdrop and trap prevent it). In-app link navigation is likewise blocked.
- Known limit: the browser Back button cannot be intercepted in the App Router. `beforeunload` covers reload and closing the tab.
- Remove sits inside the panel with a confirmation, and the last required photo cannot be removed.
- Tests cover Escape order, Keep editing keeping input, Discard closing with focus returned, Apply-to-page without a PATCH, the page-level publish, and remove confirmation.

**5. Navigation (owner decisions after review).**

- **Top bar:** only notifications and the account menu. Removed as duplicates: the workspace title (the sidebar logo goes home), "Back to home" and "View website" (the sidebar has Main website).
- **Sidebar:** the collapse toggle stays under the logo in both states.
- **Messages:** an icon-only floating shortcut with `aria-label="Open messages"`.
- **Member sidebar:** Main website, Home, Calendar, Resources, Settings, Help.
- **Pastor/Admin sidebar:** Main website, Home, **Manage**, Settings, Help. **Owner decision:** staff reach Calendar and Resources as Manage tiles. Note for Codex: this differs from refinement 5's "compact navigation items" for staff. The owner chose it after review; members keep both in the sidebar.
- **Manage hub:** centred, up to five tiles per row. The Activities tile was renamed from "Activities & calendar" so it isn't confused with the member Calendar.
  - Admin tiles: Website content, Activities, Calendar, Resources, Sermons, **Member directory**.
  - Pastor tiles: the same, but **Members & roles** instead of Member directory, plus **Pastoral care**.
- Server rules are unchanged: Pastoral care stays Pastor-only at the server boundary.

**6. Home (owner request, UI only).**

- The owner asked for the mockup's Home changes now. **This differs from refinement 6's deferral, at the owner's request.**
- The appointment, prayer and next-step forms keep their exact browser-only logic and toasts. They now open from "For you" cards in the shared side panel, with a dirty guard; `?join=` opens the next-step panel.
- Removed: the Pastor/Admin tools box (Manage replaces it) and the large gallery block (Resources is reachable from the sidebar or Manage).
- No backend or data change.

**Theme.**

- New palette and site tokens in `theme.css`, with light and dark values: `--success-*`, `--danger-ink`, `--scrim`, `--neutral-badge-bg`, and `--tile-*-bg/ink` for five tile tones.
- `editor-kit.css` contains no colour literals, and `theme.test.ts` passes. The public site is unchanged.

**Evidence (owner's Mac, 12 Nov):**

- `pnpm test:db`: **84 passed**, including the new fixed-heading test.
- `pnpm test`: **19 files, 67 passed** (76 DB tests skipped).
- `pnpm lint` (ESLint `--max-warnings=0` + Prettier) and `pnpm build` (`/admin/manage` present) pass.
- Owner browser review of the editor, panels, hub, sidebar and Home: approved ("it looks great").

**Not done (per refinement 6):**

- Activities, member administration and pastoral-care screens are not moved onto the kit; they stay as they are until their phases connect real data.
- Drag-to-reorder is replaced by visible Move up/Move down buttons, which work on keyboard and touch.

**Current next instruction:**

> Codex: focused review of `ae13e6c..45a038f`: the fixed-heading rule, editor-kit dialog and focus behaviour, save boundaries, role navigation, and the two owner-decided departures (staff Calendar/Resources in Manage; Home panels now). Claude: continue with Phase 2 slice 2 (per-record collections on the kit). No merge, push or deployment without authorization.

### Codex redesign review and finishing checkpoint — 12 November 2026, head `dfffdba`

**Verdict:** no blocking finding identified for committing/pushing this development checkpoint. Reviewed fixed-hero API enforcement, canonical resource saves/dirty isolation, page-array Apply-to-page versus browser-only collection wording, editor-kit modal stacking/focus behavior and role-specific Manage/navigation. The two owner-approved departures (staff Calendar/Resources in Manage; Home forms in panels now) are accepted as recorded decisions. Phase 2 remains incomplete; collection persistence, revisions/restore UI, cache/outbox and uploads are still later slices. This is not launch or full visual acceptance.

**Fresh Codex evidence:** `vitest run`: **67 passed**, 76 DB tests skipped as designed; `pnpm typecheck`, `pnpm lint` (ESLint + repository Prettier), `pnpm build` and `git diff --check` passed. Acknowledged the recorded owner 84 database tests and visual editor review; did not rerun DB/provider/browser checks. Restored only the generated tracked tsbuildinfo change produced by these checks. Tracked environment files include only `.env.example`; actual `.env` is not being pushed.

**Push authorization:** owner authorized pushing when the checkpoint was reviewed. Commit this note and push `backend-phase-2` to origin without force; do not merge main or deploy.

**Current next work — website finishing review, before more backend phases.** Owner still feels the website is unfinished and requests help before continuing. This supersedes the automatic slice 2 start instruction. Begin a focused read-only visual/interaction review of the areas the owner prioritizes: public pages, workspaces or both. Use real rendered desktop/mobile screens and actual navigation where available, keeping data-source limits explicit. If login/provider access is needed, let the owner authenticate; do not recreate demo access. Produce one short prioritized list in this same file: exact page/problem, proposed correction, acceptance check and whether it is UI work now or already scheduled backend work. Show a concrete proposal to the owner before another redesign. Preserve the accepted gold/neutral theme and fixed headings unless explicitly changed by the owner. Avoid new dependencies, speculative features and duplicate audits to conserve credits.

Include in finishing review: route discoverability/back paths; responsive spacing/calendar overflow; consistent page headers/forms/actions; loading/empty/error/save states; photo/placeholder content; keyboard/focus and modal dismissal. Existing known limitation: browser Back can leave a dirty panel despite its backdrop/focus trap and beforeunload handler. Treat safe draft recovery/dismissal and assistive-technology background isolation as review items, not verified guarantees. Do not describe browser-only care/activities as completed live services.

**Claude instruction after the owner chooses the finishing scope:** Read this checkpoint; do not start Phase 2 slice 2 yet. Support a bounded website finishing review and implement only the owner's approved fix list. Update this sole handover with evidence. Once that review/fix checkpoint is accepted, return to the existing Phase 2 slice 2 plan without reopening settled authentication/provider decisions. No merge, push or deployment without authorization.

### Workspace consolidation — owner requirements and source analysis, planning only

**This is the current product-planning checkpoint. It supersedes earlier role/Manage/video-approval assumptions where explicitly stated below. No application changes are authorized by this analysis request. Pause automatic slice 2 implementation until the owner accepts the resulting structure. Public pages' visual design is accepted and out of scope.**

**Latest owner clarification:** there is one fixed Admin account and one fixed Pastor account. Both are staff CMS operators and can manage ordinary member accounts. Pastor has a distinct Home with statistics, sole video-publishing approval and private prayer/appointment handling; Admin must not receive care records or care counts. A member has four core modules: shared calendar/own activity participation, prayer requests, appointments and gallery; messaging is an additional shared future feature. No member tools for managing other people's schedules. Staff schedule inside the app; public activities sync one-way to the church Google Calendar (owner confirmed). Do not introduce two-way Google edits.

**Changes to earlier decisions:** Admin is no longer a read-only member-directory role. Scope ordinary-member account management to both staff, with audited member-only operations; no UI to promote members into additional Admin/Pastor roles or edit the fixed staff accounts. Staff credential recovery/provisioning is an operator process; preserve final-Pastor and staff-lockout protections during migration. Existing tests/API permission matrix must be revised deliberately when implemented, not silently bypassed by the UI. Fixed public headings stay fixed. Ordinary website saves still publish immediately; video content is a specific Pastor-approval exception applying to manual uploads/direct recordings as well as any future OBS path. These are planned contract changes, not implemented permissions.

**What the source actually does now (not a full live browser audit):**

| Area                            | Current evidence                                                                                                                                                                                                                                                     | Consolidation decision / proposal                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home for three roles            | `/admin` and `/pastor` re-export `/members/page.tsx`; all show the member calendar, updates, latest sermon and engagement. No requested Pastor statistics.                                                                                                           | Shared calendar-first Home; role-specific summaries/actions. Pastor gets authorized real-data counts and approval/care queues.                                                                                                                                                                                                                       |
| Separate Manage hub             | `manage-tiles.ts` lists Website, Activities, Calendar, Resources, Sermons, members and care. This makes staff leave Home to discover tools.                                                                                                                          | Move tool cards/entry points into a compact Staff tools section on Home; retire `/admin/manage` as a separate stop (redirect to role Home to preserve deep links). Keep full editors as dedicated routes, not embedded long forms.                                                                                                                   |
| Calendar vs activity management | `MemberCalendar` wraps `ActivityCalendar`; Home and `/members/calendar` show it; `/admin/events` has activity editing, exceptions, capacity and roster controls; `MemberActivities` offers a separate join list. Same Activity model already exists in browser data. | One calendar workflow with calendar/list views and shared activity-detail panel. Staff create/edit/roster from it; members join/cancel only themselves. Remove duplicate standalone activity join blocks from Home. One editor/data model, multiple intentional views.                                                                               |
| Public schedules                | Public cards/calendar use Activity records. Most are still browser-local, so the connection is not durable/shared across devices.                                                                                                                                    | One durable Activity/occurrence source drives public schedule/detail, all three Homes, bookings and Google public-calendar sync. Keep public layout unchanged.                                                                                                                                                                                       |
| Prayer and appointments         | Editable status lists exist in both `/pastor/care` and the selected-person view in `/admin/users`. Appointment type/date/message is rendered in the latter even for Admin, with only the select disabled. Data is still in mixed browser state.                      | One Pastor-only care workspace with Prayer and Appointments tabs, linked from Pastor Home counts. Remove care bodies/management from member-account management. Admin API responses, browser payloads and statistics exclude them. Members see only their own requests/history. Hiding or disabling controls is not a privacy boundary.              |
| Account management              | `/admin/users` mixes directory, accounts, participation, care, assignments and unconnected role/delete dialogs; identity API exists but directory UI still uses browser users.                                                                                       | People editor is member accounts/profile/status only, connected to canonical users. Link to activity rosters instead of duplicating roster editing here. Fixed staff records read-only/protected. No staff-role assignment screen. Audit explicit actions. Account deletion remains a real retention workflow, not a fake success.                   |
| Sermons                         | `/admin/sermons` updates browser state on every input; Admin can choose `published`; no pending-approval state. Copy says only future OBS needs approval.                                                                                                            | One Videos/Sermons library: Admin/Pastor prepare and Save drafts; request approval; only Pastor approves the exact saved revision for publication. Pending content stays off the public site; processing-ready is separate from approval. Remove the misleading immediate-video-publishing copy and ordinary Admin publish option when implementing. |
| Gallery/resources               | Read-only `/members/gallery`; resources edited within CMS Site details; Home previously repeated a gallery block.                                                                                                                                                    | One Gallery/library data source with staff edit controls and member view/download access. Separate this content-library editor from public page layout settings. Distinguish downloadable resources from public gallery photos rather than blindly merging their data/access rules. No member delete/upload management.                              |
| Next steps / participation      | Member Home has a standalone interest/application flow plus an activity joining flow. Public editorial journeys also exist.                                                                                                                                          | Keep public journeys. Route ordinary joinable activity actions into the calendar's join panel. Remove standalone generic member opportunity/application navigation; retain distinct interest requests only for journeys genuinely requiring follow-up, pending owner review. Never convert an interest request into a confirmed booking.             |
| Settings / messages             | Personal security/profile and floating messages exist.                                                                                                                                                                                                               | Retain essential personal profile/security access as utilities, not extra member CMS modules. Shared messaging remains a future connected feature; retain one entry without a separate inbox duplicate.                                                                                                                                              |

**Save inconsistency confirmed in source:** Website page fields use an explicit draft and Save and publish. Page arrays use Apply to page then page Save. Browser-only CMS collections use Save in this browser, but Move up/down and Remove mutate immediately. `/admin/events` input handlers call change → save → update on every keystroke; `/admin/sermons` change → update does the same. Pastor care and member-account activity status selects mutate on change. These are prototype browser writes, not uniform durable saves. The owner correctly observed inconsistent behavior.

**Target save contract:** every content/editor field changes a local draft only; explicit Save creates/updates the real record. Cancel/discard leaves the last confirmed record unchanged. Reorder and delete remain staged until Save, or are clearly labelled standalone actions with confirmation and an explicit server response. Do not advertise a new item or publish while merely typing. Prevent loss on panel/route dismissal; preserve values on validation/conflict/network failure. Booking/cancellation, prayer submission, appointment request, suspension and approval are explicit actions with their own confirmation/result rather than requiring an unrelated page Save. Page arrays stay page-versioned; relational records get their own versions. Never show queued/preview-only actions as completed delivery.

**Proposed Home information layout:**

- All roles: shared church calendar as the main surface; date selection opens activity details. Member detail has join/cancel and remaining places; staff detail also has Edit/roster, with one Create activity action. The calendar is not an iframe-only Google calendar: it must support app capacity/permissions.
- Member: four clear entry points (Calendar, Prayer, Appointments, Gallery), own upcoming bookings/appointment updates; personal settings in account utilities. Remove standalone attendance, service-assignment, generic Next step and management blocks from primary Home; retain needed actions inside their owning module.
- Admin: same calendar, concise website-content and operational-content/People editor entry points directly on Home. No separate Manage stop, no care counters or private care lists. Only non-confidential counts if useful.
- Pastor: same staff foundation plus a compact real-data statistics row (published videos, member accounts, pending/handled prayer, pending/confirmed/completed appointments) and video approval queue. Counts link into the corresponding filtered list, rather than embedding full lists/forms again. Define whether member count excludes fixed staff and show labels/time windows. Never count seed/demo records as real stats.
- Group staff entry points into two understandable areas: Public website (existing page content/settings) and Church operations (Calendar/activities, Videos, Gallery, People); Pastor alone also has Care/approval. This can be two labelled groups on Home, not two competing CMS systems or two databases.

**Google and privacy:** app PostgreSQL is authoritative for activity occurrence IDs, capacity, bookings and ownership. Google is a one-way published public-calendar projection with stable IDs and retry-safe create/update/cancel. Do not publish member rosters, email addresses, prayer records or appointments to that public calendar. Members do not require Google accounts to use the app calendar. Private confirmed appointments can overlay the same UI only for the member owner/Pastor; a requested date is not a confirmed slot, and approval checks conflicts. Calendar availability must not reveal other members' identities/reasons. The Google event API provides attendee/visibility controls, but these are not an app booking-capacity policy; enforce our rules server-side. Reference: https://developers.google.com/workspace/calendar/api/v3/reference/events .

**Video approval contract for planning:** draft → awaiting approval → approved/published; rejection returns to revision with feedback; archive is separate. Save does not approve. Approval binds to a saved revision and ready/verified asset; material recording or public metadata edits require renewed approval. Decide how an already published approved version remains live while a replacement awaits approval. Ordinary public page saves keep immediate publishing. Incorporate this schema/permission boundary in Phase 2 slice 2 before building sermon endpoints that would allow Admin to publish directly; full FFmpeg processing remains Phase 5.

**Implementation sequence after owner approves the structure:**

1. Agree the Home/module map, member-only People permissions and explicit save contract in this same handover. Source review is completed; do not repeat a broad audit or build a fresh visual theme.
2. Refine existing shared Home/navigation and editor-kit patterns in small reversible changes, using canonical module destinations. Preserve existing deep links with redirects where needed. Avoid building a second calendar or duplicate management forms.
3. Resume Phase 2 slice 2 using the agreed People/Video/Gallery boundaries and explicit record saves; no general care backend hidden in this slice. Then finish existing revision/cache/upload slices with S3/CloudFront.
4. Phase 3 delivers connected calendar/activity/booking/capacity and Google public sync as a core owner requirement (promote former optional 3b before launch). Phase 4 delivers confidential care/appointments and member management/real statistics. Phase 5 delivers worker/media jobs and remaining account/notification operations. Dashboard cards awaiting these must show unavailable/empty states, not invented numbers.
5. Owner acceptance checks: create once as staff → same activity on public page/all Homes/Google; race for final place admits one; member cannot alter another booking; pending video invisible until Pastor approves; Admin cannot retrieve care payloads/counts; editing without Save changes neither database nor public view; role Home has no duplicate editing workflow.

**Outstanding planning detail:** confirm whether "Gallery" means the current downloadable Resource Gallery, a photo/video gallery, or both as filtered categories. Keep public decorative photo gallery and private member files separately access-controlled in any case. Record the chosen names without building a new media module by assumption.

**Current Claude instruction:** Planning only. Read this consolidation analysis and the owner's latest requirements; do not implement the old automatic slice 2 instruction. Present one concise Home/module map and the minimum contract changes needed for fixed Admin/Pastor accounts, member-account management, mandatory Pastor video approval and explicit saves everywhere. Preserve public visual design and the accepted theme. Do not create additional handover files or repeat the source audit. Wait for owner approval of the structure before application changes, then resume the existing backend phases under the revised boundaries. No merge, push or deployment.

### Home simplification and activity purpose — planning continuation

**Owner direction:** continue planning and save decisions for later phases. Claude is the implementer; Codex analyses/reviews. No application changes now, no automatic resumption of an older build instruction.

**Home simplification scope carried forward:** remove the For you promotional section, Your updates card, Latest sermon card, separate Sunday summary and duplicate activity-joining list from Home. Calendar is the primary surface. Move compact staff tool entry points onto Home instead of the separate Manage landing page (preserve deep links). Keep direct, simple access to the four member modules: calendar/own bookings, prayer requests, appointments and gallery; removing the cards must not strand those functions. Reuse existing request panels behind deliberate entry points until their backend phase, retaining honest preview states. No invented statistics or new dashboard features. Public visual design and accepted theme unchanged. The exact simple entry-point placement remains a planning choice, not an excuse to recreate the removed promotional sections.

**Manage activities purpose (current source):** `/admin/events` is a structured record editor for services, groups, Bible studies, events and ministry teams. Staff can create records and edit schedule/recurrence, location/venue, joining rules/capacity, visibility/release time, date exceptions and rosters. Types and field layout are predefined; the activity records are not fixed. The current UI presents too many fields together and mutates browser storage on change. It does not yet provide durable cross-device booking/capacity or Google sync. Do not describe this prototype as the completed live calendar service.

**Proposed future interaction (not yet approved final design):** retire the separate Manage activities destination from primary navigation and expose the same underlying functionality through the Home calendar. Staff: Create activity → a short panel for title/type/date-time/location/description → optional joining/capacity and recurrence details → explicit Save. Select an existing activity to view details, Edit, or view roster. Recurring edits distinguish one occurrence versus the series. Member: select the same published activity → details/remaining places → Join or Cancel own booking, never staff schedule/other members' bookings. Staff management can have an accessible list view alongside calendar view without creating another data source or editor. No custom page-builder or arbitrary field designer is required by "modular" unless separately requested.

**Phase placement:** Phase 2 public editorial content references activities rather than storing independent schedules; keep service times/booking details out of duplicate CMS fields. Phase 3 owns durable activity records, recurrence, occurrence exceptions, join/cancel, capacity and public Google sync, and replaces the current activity editor with the agreed calendar-linked UI. Phase 4 owns private appointment requests/confirmation and prayer handling. Video approval/metadata design enters slice 2 and media processing Phase 5 as above. Every editor uses explicit Save, including reordering/deleting with clearly defined staged or confirmed behavior.

**Next planning discussion:** establish the simplest staff Create/Edit activity panel and the member activity detail/join panel; confirm what Gallery contains. Do not implement until the owner finishes planning and authorizes Claude. Update this same file instead of creating more plans.

### Calendar integration simplification — planning recommendation

Owner agrees activity management should operate through the calendar and is concerned that the current editor exposes too many features for reliable Google Calendar integration. Still planning; no implementation or existing data deletion authorized.

**Recommended first calendar scope:** title, short description, start/end time in Pacific/Auckland, location, optional simple repeat, optional Join enabled/capacity, and explicit Save. Staff can edit/cancel and see participants from the selected event; members can join/cancel themselves. Calendar/list are two views of the same records. Begin with one-off events and a simple weekly repeat if required by actual church schedules; review the need for other existing recurrence rules before enabling them, preserving existing records. Core cancellation and booking correctness are mandatory, not optional embellishments.

**Narrow Google boundary:** export only published event title/description/location/start/end, supported recurrence and cancellation, plus a link back to the app. Store Google IDs/sync status privately and show pending/failed/retry to staff. App save success and Google sync success are distinct; provider failure does not lose the saved activity or fabricate a synced state. One-way app → church public Google calendar, no Google attendee invitations or attendee/roster payloads, no direct Google edits or personal-calendar integration in this initial scope.

**Keep in app:** capacity, transactional booking, ownership, participant lists and private appointment/care data. Google Calendar `maxAttendees` is a response-size parameter, not booking capacity. Private appointments never go to the public church calendar, even if shown as a role-restricted overlay in the app. Source: Google Events resource and recurring-events guide, checked 12 Nov 2026: https://developers.google.com/workspace/calendar/api/v3/reference/events and https://developers.google.com/workspace/calendar/api/guides/recurringevents .

**Defer or hide from the initial form, subject to owner acceptance:** scheduled public releases, separate ongoing membership management, service rosters/assignments, elaborate repeat-rule editor, bulk edits and personal calendar sync. Do not delete existing records or silently strip recurrence during this simplification. A safe occurrence change/cancel path is still needed for any recurrence that remains enabled. Expand scope only for a concrete church workflow.

**Claude planning instruction:** distinguish Google-supported event data from app-only booking rules; do not try to reproduce the full activity domain inside Google or embed a Google-only calendar as the app booking interface. Present the small Create/Edit form above for owner acceptance before building. Continue to use this sole handover and preserve the existing accepted role/Home/save decisions. No application changes yet.

### People/member management — connection plan (planning only)

Source check confirms Phase 1 has canonical User records, authenticated gateway, current-profile/security/session endpoints and Pastor-only status/role mutations. The directory UI still reads `content.users` and mixed browser participation/care records. There is no real staff member list/detail API yet. Do not mistake `/v1/me` (own account only) for permission to fetch arbitrary members.

**Reuse:** session/assertion verification, canonical user IDs, Prisma User status/version, shared error envelope, If-Match, audit and the user-security lock/session-revocation implementation. No replacement identity system.

**Build in the People/member-management phase:** bounded/searchable `GET /v1/staff/members` and restricted `GET /v1/staff/members/:id`; return only needed member account/profile fields, never hashes, provider tokens or care/appointment payloads. Initial UI is search/filter/list → one detail panel with basic account information and explicit suspend/reactivate actions. Ordinary members see no staff directory. Remove mixed care, assignments and roster editors; link to their canonical tools later. Use a future staff-authorized member-status route backed by the shared status service, rather than simply opening every `/pastor/*` route to Admin.

**Permission migration required by the new owner model:** Admin and Pastor can manage ordinary MEMBER accounts; fixed Admin/Pastor accounts are protected from those operations, even with guessed IDs. Existing role-change endpoints must not remain a bypass for creating more staff accounts; retire/deny routine role mutation according to the fixed-one-of-each decision. Staff account recovery/provisioning remains a deliberate operator process. This is a real backend/test change, not hiding role controls. Define the controlled bootstrap/migration procedure so existing staff are preserved and existing multi-Pastor test fixtures are revised deliberately.

**Write behavior:** use explicit confirmed Suspend/Reactivate actions with current record version; status update, audit and session revocation are atomic under the existing security lock. Stale action gives conflict/reload, failed action leaves prior displayed state, success only after API confirmation. Profile edits (if later authorized) use a local draft and Save; no editable identity email/credential field by assumption. Password recovery remains the existing verified self-service flow. Permanent deletion is deferred to the Phase 5 retention/deletion workflow, not enabled as an unimplemented button.

**Verification:** real new Member appears without localStorage; both staff can view/manage ordinary members; members cannot access list/detail; staff cannot mutate each other/self through this interface or promote members via the old role route; suspend blocks the next request; stale versions and failed writes preserve correct state; no private-care fields in staff directory responses. Reuse existing auth tests where applicable and add focused directory/permission tests.

**Sequence:** finalize this compact People UI during planning; implement its real APIs/adapters in the existing member-management phase, separate from Phase 2 CMS persistence. An isolated early list/status slice is possible only if explicitly reprioritized by the owner. Keep prototypes labelled/unavailable until connected, and do not rebuild the current mixed screen before defining its contracts. No application changes authorized by this planning section.

### Resource Gallery — owner intent and sermon-library recommendation (planning only)

**Confirmed owner intent:** Gallery is a Drive-style shared file library. Admin/Pastor can drag/drop uploads, organize/edit file information, and delete; members can browse/open/download only, with no upload, edit, move or delete access. Do not implement merely hidden buttons: API authorization and protected download grants enforce access. This clarifies the earlier outstanding Gallery question. Google Drive is an interaction reference, not a request to add Drive storage/integration; existing storage decision remains S3 + CloudFront.

**Recommended structure (awaiting owner agreement on sermon presentation):** one underlying file/asset store and one Gallery, with folders/categories, search, list/grid views and clear file type/size. Admin/Pastor see management controls in the same library; members see read-only controls. No second staff upload screen or duplicate resource lists inside Website content. Start with simple folders, not per-folder sharing, collaborative document editing or a full Google Drive clone.

**Sermons:** keep a dedicated Videos/Sermons editorial workflow for metadata, processing and Pastor approval. Gallery may expose a Sermons folder/category linking the approved, published recordings and notes, and public Sermons pages use those same records/assets. Upload once, reference by asset ID, no duplicate storage/copies, approval state or independent publication toggle in Gallery. Members must never see pending/unapproved recordings through the library, direct asset IDs or download links. Do not apply Pastor approval to ordinary non-video resource uploads unless separately requested. Existing requirement that video publication needs Pastor approval applies to library-accessible videos too; generic upload/replacement must not bypass that boundary.

**Draft/save behavior:** drag/drop prepares a visible upload queue; an explicit Upload/Save action starts the transfer and shows durable progress/results. Successful transfer is not permission/publication; assets become available only after server verification, access assignment and any required video approval/processing. Rename/description/folder changes use a draft and Save; removal is an explicit confirmed action, preferably recoverable archive/trash first. Failed uploads keep useful retry state. Do not claim an upload is complete or a video ready based on local preview.

**Reference/deletion behavior:** deleting or replacing a file used by an approved sermon/public page must show its dependencies and prevent silent broken links or approval bypass. Material video replacement creates a new pending version requiring Pastor approval; keep the approved version live until replacement approval unless Pastor explicitly unpublishes it. Protected assets require short-lived authorized download grants; source/unapproved media remain private. Do not expose member-only files through public CloudFront URLs merely because some videos are public.

**Phases:** Phase 2 slice 2 establishes Resource/Asset/Sermon identities and library metadata; the upload slice adds verified S3 uploads, member-read/staff-write authorization, download grants and basic folder actions. Phase 4 completes member library access acceptance as needed; Phase 5 adds long-running media processing. Build one shared library, not separate staff/member implementations. No implementation authorized yet; owner is still planning.

### Gallery storage and file types — owner clarification, 13 November 2026

Gallery uses the existing Amazon S3 storage platform as well as sermon/video assets; no Google Drive storage account or second provider is required. Owner wants a general-purpose file library, not just photos or PDFs. Plan support for documents (PDF/Word/text), spreadsheets, presentations, images, audio, video and archives, with an explicit supported-extension/MIME/size policy defined before implementation. Unsupported preview formats still download where allowed; do not promise inline preview for every format. Do not interpret "all kinds" as permission to execute uploaded content or render arbitrary HTML/scripts in the app origin.

Keep public approved media, member-only files and pending/source uploads under distinct access policies (buckets or prefixes as appropriate). Upload verification checks actual object size/type and safe filenames; private files/download grants require current authorized access, not just a hidden link. Serve non-preview files as downloads with appropriate headers; define malware/quarantine handling before general untrusted uploads are enabled. Staff uploads remain the only write path. Preserve video approval requirements regardless of whether a recording entered through Sermons or Gallery, and reuse assets by reference instead of uploading another copy. S3 supplies object storage; folders/search, permission checks, upload queues and metadata remain app features backed by database records. No implementation changes authorized; planning continues.

### Website content tabs — source review and planning recommendations, 13 November 2026

Owner asks whether the simplified tabs cover public pages and what to improve. Source review only; no application changes. These recommendations are not permission to restore editable fixed headings, introduce a page builder or redesign public layouts.

**Current coverage:** Home edits featured verse, slideshow and community-photo strip. About edits intro/history, two images, values, office hours/ministry years and browser-only leadership. Locations edits browser-only campus records and links to activity scheduling for service times. Next steps edits browser-only editorial journeys/CTA links. Giving edits verse, impact areas/percentages and shared bank information. Site details edits contact/footer addresses, social links, sign-in verses and the browser-only downloadable resources list. Events/Sermons page heroes remain fixed; activity and sermon records belong to their own operational editors. Locations/Next steps currently have no server-backed page-resource Save in this tab (`tabResources` empty), because their collections are still waiting for slice 2. Six tabs can cover seven pages plus shared content without requiring duplicate event/sermon editors.

**Verdict:** a structured content editor is appropriate and deliberately simpler than a page-layout builder. It is not yet a complete production CMS: collection persistence, image assets/alt metadata, restore and uniform save behavior are unfinished. Some decorative labels/CTA/section copy remain in code by design; audit editable-body versus intentionally fixed copy once before declaring coverage complete. Do not promise every public word is editable.

**Recommended improvements, for owner approval:**

1. Keep these six tabs with clear section labels matching the public page. Each section has a small visual reference/thumbnail or precise location description, rather than more settings. Explicitly distinguish Public website Home from Workspace Home.
2. Provide separate "View live page" and "Preview unsaved changes" semantics. The current View page link shows the live site, not a faithful draft preview. A preview must be staff-only, carry the exact draft/version through supported detail navigation and never publish or permit real form submissions. Deliver preview incrementally only where supported; do not fake it with provider-wide draft promotion.
3. Consistent explicit Save/Discard and per-tab dirty markers. Relational collection Save is one confirmed record operation; page-array panels apply to the page draft and page Save publishes it. Reorder/delete behavior must be equally explicit. Current browser-only campus/journey/team/resource editing is not production persistence. Complete it in slice 2 rather than adding duplicate Save wrappers over localStorage.
4. Image fields pick reusable S3 assets from the staff library when uploads arrive, with thumbnail, replace/remove, descriptive alt text where meaningful, order and crop/focal information only if used by the public component. Public decorative photo strip is distinct from member Resource Gallery. Preserve approved HTTPS hotlinks during transition and do not make arbitrary hosts server-fetchable.
5. Keep operational records out of page-copy editing: service times/bookable activities come from Calendar; approved videos from Videos/Sermons; downloadable member resources from Gallery. Page tabs can link to the one canonical record editor or choose existing records if editorial curation is needed, not create competing copies.
6. Next steps needs deliberate destinations (join a particular activity, request an appointment, or a genuine follow-up-interest request) rather than arbitrary stale `/members?join=` links to removed Home sections. Public journeys remain editorial content; scheduling/capacity come from the linked activity.
7. Giving uses one canonical bank-settings record, a clear change confirmation, validation and audited explicit Save. Impact percentages must be validated consistently with what the public page claims. No payment checkout feature added.
8. Site details retains only genuine shared public settings; move the resource list to Gallery. Contact/footer information may have deliberately different display text, but shared underlying facts should not diverge by accident. Website/legal copy remains owner-supplied; don't invent church/bank facts.
9. Add revision history/restore when the already planned slice 3 arrives; restore is a new versioned audited write, not silent rollback. No new website approval queue—ordinary saved page content publishes immediately; video publication is the existing Pastor-only exception.

**Phase alignment:** slice 2 completes structured records and canonical destinations; slice 3 revision/restore; upload slice asset selection/metadata; preview is a bounded CMS UX task tied to the actual draft model. Start with mapping/save consistency and correct destinations before adding visual preview features. Keep public design and fixed headings unchanged. Claude remains in planning until owner authorization.

### Website tabs approved; image audit — 13 November 2026 (planning only)

Owner accepts the Website content tab improvement recommendations recorded above: section mapping/visual references, consistent Save/Discard, asset selection, clear live-versus-draft preview, canonical operational sources, purposeful Next step destinations, bank-setting safeguards and revision/restore. These are requirements for the future slices, not permission to implement during planning.

**Current image behavior checked in source:** slideshow is a variable array with API maximum 12; public community-photo strip is variable with API maximum 24; both render arrays rather than a hardcoded number. CMS supports add/reorder/remove and prevents removal of the last item, but Add does not stop at the API maximum. About banner/story each use one explicit image slot; team/campus/sermon records each have their own image. Such slots are layout constraints, not a limit on the future S3 library's total size.

**Image code gaps before production:** API currently permits empty slideshow/gallery arrays despite the CMS minimum-one rule. HeroGallery uses modulo images.length and starts an interval even with zero/one image; zero causes invalid index state. Duplicate URLs are used as React keys. About schemas allow empty image strings while public image rendering needs safe handling of absent images. Public SiteImage has no shared broken-photo fallback (CMS preview does). Image arrays are only URLs, so lack stable placement identity/alt/focal metadata. Arbitrary HTTPS photos deliberately skip server optimization, so large source images remain a performance dependency. These are targeted improvements, not a requirement to replace the frontend.

**Recommended image plan for owner approval:** share min/max constraints between API/editor, show count/limit and disable Add at max; make zero/one/multiple-image rendering safe; handle empty/broken public photos; use stable asset/placement IDs (allow intentional reuse without duplicate keys); attach appropriate alt text to meaningful placements, decorative images use empty alt; preserve useful aspect ratio and optional focal point only where the layout supports it. Prefer the S3 library asset picker/upload flow over raw URL typing once implemented, retain approved hotlinks as an alternative. Pick sensible displayed slideshow length and public gallery pagination/Show more if needed rather than rendering an unlimited collection. Keep About's named single slots unless the owner explicitly requests a different layout. No library-wide image-count cap implied. Verify boundary counts, removal/reorder, duplicate reuse, failed loads and mobile layout through focused tests/visual checks in the corresponding image/upload slice.

### Image editing scope — owner decision, 13 November 2026

No crop capability is required. This supersedes earlier recommendations for cropping, focal-point controls or an image-editing UI. Website/Gallery image management supports selecting/uploading, previewing, replacing, removing, ordering and appropriate alternative text. Existing responsive image fitting may remain; no new crop editor or crop-related dependency is planned. Preserve aspect ratios where appropriate and verify the existing layouts with portrait/landscape images. This decision does not require removing the existing profile-photo preview crop as part of this planning task; revisit it only if the owner explicitly requests removal. No application code changed.

### Current handoff instruction — revised phase plan, 13 November 2026

The active plan is now at the top under Current decisions and Delivery phases and review gates — revised 13 November 2026. It overrides historical optional-Google-sync, Admin-read-only, Pastor-role-promotion, immediate-video-publishing, cropping and separate Manage instructions. Only documentation changed. Planning remains active; this revision is not permission to implement.

**Paste into Claude when the owner authorizes the plan:** Read only the current decisions, revised delivery phases and relevant slice evidence in PROJECT-HANDOVER.md before inspecting the needed source. Start Phase 2A only: agreed Home simplification/navigation and narrow screenshot defects, preserving four member destinations, public design/theme and existing backend behavior. Do not invent statistics or delivery. Update this same file, run affected checks and return for owner/Codex acceptance. Then continue 2B–2D and Phases 3–6 in sequence, including mandatory one-way Google public calendar sync, fixed staff/member management, S3 file library and Pastor-approved video publication. No duplicate handovers, broad redesign, new auth system or unrelated rework. Coordinate builds with the owner's dev server to avoid shared .next corruption. No merge, push or deployment without authorization.

### Future automation and Messenger clarification — owner decision, 13 November 2026

Automated publishing pipeline and Messenger-style chat are future features; prepare their backend foundations without requiring full implementation for core launch. Active Phase 4/5 and Future F1/F2 above are updated accordingly and override historical Phase 5 media/chat launch requirements. Core still supports verified manual video upload and Pastor-only publication. Approval must never be automated away. Existing message UI/shortcut must be hidden or clearly unavailable until real service exists. No application changes authorized; revised-plan approval is still pending.

### Phase 2A checkpoint — Claude, 13 November 2026, head `5854084`

Scope: "2A. Small navigation/Home cleanup and reported visual defects" only. No Google sync, permission changes, Gallery uploads, publishing automation or chat. No backend or API changes in 2A. The theme tokens are unchanged, and the public layouts are unchanged apart from the listed defect fixes.

**Commits (`dfffdba..5854084`):**

| Commit    | Change                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| `49ea86f` | Calendar-first Home, staff tools moved to Home, member destinations, link redirects, screenshot defects              |
| `7c6bf99` | Owner feedback: calendar first; staff tools back to the large-tile design, below the calendar                        |
| `7054a33` | Owner feedback: full-width Google-style workspace calendar; member tools as plain links; smaller "Staff tools" label |
| `5854084` | Profile "Change photo" button visible on the dark card (owner-reported during review)                                |

**Home (workspace, every role)**, `members/page.tsx` (also `/pastor` and `/admin`):

- Layout, top to bottom:
  - the welcome, with the four member tools beside it;
  - the shared calendar at full width;
  - **Staff tools** tiles, for Pastor and Admin only.
- The four member tools are plain icon-and-label links:
  - **Calendar & bookings** → `/members/calendar`
  - **Prayer** and **Appointments** → the existing browser-only forms in the shared side panel, with the dirty guard
  - **Gallery** → `/members/gallery`
- Removed, as agreed: For you, Your updates, Latest sermon, the separate Sunday summary on Home, and the duplicate activity-joining block.
- Staff tiles:
  - Admin: Website content, Activities, Sermons, **Member directory**.
  - Pastor: the same, but **Members & roles** instead of Member directory, plus **Pastoral care**.
  - Source: `lib/staff-tools.ts`, which replaces the old manage-tiles module. No statistics are shown, because none exist yet.
- The workspace calendar (`ActivityCalendar member`) is no longer capped by the public calendar's 60rem width. It is a full-width month grid of tall cells listing up to three activities each, coloured by kind with theme tokens, with "N more" for the rest. Phones keep compact cells with dots, and the day detail list is unchanged. The public `/events` calendar is unchanged.

**Navigation:**

- Sidebar for every role: Main website, Home, Calendar, Gallery, Settings, Help. There is no Manage stop.
- `/admin/manage` now redirects on the server to `/pastor#staff-tools` or `/admin#staff-tools`.
- The CMS back link reads "← Home" and points to the role home.
- The top bar, the toggle under the logo and the icon-only Messages shortcut are kept from the reviewed redesign.

**No stranded links:**

- Joining and bookings (`MemberActivities`) moved to the Calendar page ("Calendar & bookings").
- The public Locations Join now targets `/members/calendar?activity=…#activities`.
- Home redirects legacy `?activity=` links, and `?join=` values that match an activity title, to the Calendar page with the same query.
- Next steps `?join=<opportunity>` links still open the next-step request panel on Home.

**Screenshot defects, narrow fixes:**

1. **Campus selector:** `lib/campus.ts` `campusLabel()` uses the part after " — " when present, and otherwise the full name, so the label is never blank. Unit-tested.
2. **Connect group and Bible study cards:** one `.activity-card-actions` group pinned to the card foot, with a primary **Join** (`button`) and a secondary **See dates** (`button button-outline`). The pinned group keeps cards aligned. The old full-width gold link rule was removed.
3. **Profile card:**
   - `.profile-summary h1, h2` both get the light-on-dark colour.
   - The card uses `align-self: start`, so it no longer stretches into an empty dark block.
   - The outline "Change photo" button is legible on the dark card; it was invisible until hover.
4. **Sign-in page:**
   - The decorative `aside:after` bar is removed, leaving the verse dots as the one indicator.
   - The dots are spaced from the verse, have larger tap areas (padding with background clip) and carry `aria-pressed`.
   - The charcoal panel is unchanged, as a design choice.

**Tests:**

- New `member-engagement.test.tsx`:
  - the four destinations, and the Prayer and Appointments panels;
  - the `?join=` next-step panel;
  - the `?activity=` redirect;
  - joining and bookings still render with the calendar.
- New `staff-tools.test.ts`: role sidebar links with no Manage, and staff tiles per role.
- New `campus.test.ts`.

**Evidence (owner's Mac, 13 Nov, head `5c97de0`):**

- `pnpm test`: **20 files, 71 passed** (76 DB tests skipped as designed; `test:db` unaffected, since 2A has no API/DB change).
- `pnpm lint`: ESLint `--max-warnings=0` and the full Prettier check pass. The first run flagged an unused `role` parameter in `workspaceLinks()`; it was removed in `5c97de0`, since the sidebar is the same for every role.
- `pnpm build` passes, with the dev server stopped. Delete `apps/web/.next` before the next `pnpm dev`.
- Owner browser review:
  - **Seen and accepted:** the Home layout through several iterations, the full-width calendar, the staff tiles, the member tool links and the profile button fix.
  - **Not explicitly confirmed:** the Locations cards and campus pills, the sign-in dots, the `/admin/manage` redirect, and the narrow-mobile pass.

**Remaining limitations (for Codex):**

- The Messages floating shortcut still opens the prototype local chat. Per Future F2 it should be hidden or clearly unavailable until the real service exists. Not changed in 2A; it needs an owner choice between hiding and an unavailable page.
- The next-step request panel is reachable only from public Next steps `?join=` links; there is no Home entry. Phase 2B replaces these CTAs with real destinations.
- The Sunday summary is removed from Home only. It remains on the Calendar page and on public Locations.
- Calendar chips are `aria-hidden`; screen readers get each day's count from the cell label and the titles from the day detail list.
- Leftover CSS from the old Manage hub (`.kit-hub*`) is unused. Harmless; it can be removed in a later pass.
- Browser Back still cannot be intercepted for a dirty panel (unchanged).

**Current next instruction:**

> Owner: confirm the unconfirmed browser items. Codex: review `dfffdba..5c97de0` against 2A's exit criteria, and advise on the Messages shortcut (hide vs unavailable). Claude: wait for owner/Codex acceptance before starting Phase 2B. No merge, push or deployment.

### Codex Phase 2A checkpoint — 13 November 2026, head `2b61c56`

**Verdict:** core Home/navigation and narrow screenshot fixes pass source review; one agreed future-feature exposure remains before closing 2A. No application changes made by Codex and nothing pushed/merged/deployed in this checkpoint.

Reviewed shared Home removal of For you/updates/latest sermon/Sunday/duplicate join blocks; member destinations retained; staff tools on Home and server redirect from Manage; legacy join/activity destinations; full-width workspace-only calendar; fixed campus labels; action grouping; profile contrast/height; login indicator cleanup. Public calendar remains separate in presentation, sharing the existing activity model. No new auth/API/DB/Google feature introduced. Existing browser-backed forms and activity management remain prototype limitations until their designated phases, not new delivered backend functions.

**Fresh checks:** regular suite **71 passed across 20 files**, 76 DB tests skipped as designed. Acknowledged Claude/owner lint and stopped-server build evidence at `5c97de0`; did not repeat those checks or the unaffected database/provider suite. Owner's Home visual acceptance is recorded. Narrow-mobile, Locations cards/pills, login dots and Manage redirect were not explicitly confirmed; do not mark those visual checks passed from source/tests alone.

**Follow-up:** Future F2 already requires hiding or clearly disabling the prototype chat; no new product choice is needed to use the simpler safe default. Claude should hide the floating Messages entry for now and make direct `/members/messages` visits show a concise unavailable/future-feature state rather than an editable local chat. Do not implement chat services, realtime or notifications. Add focused navigation/direct-route coverage. This is a deferred-feature UI change, not a new permission system.

**Owner visual checklist after that small follow-up:** narrow-mobile Home calendar/navigation/member tools; Locations campus pills and group/study action spacing; sign-in verse dots; profile name/photo control; `/admin/manage` lands at staff tools for each staff role. Do not request another broad design review or repeat provider signup. Build only with the dev server stopped or isolated output.

**Current Claude instruction:** Finish only the Messages unavailable-state follow-up and the remaining 2A visual checks, update this handover with actual evidence, then return for the brief closing checkpoint before Phase 2B. Do not change account permissions or add backend phases in this slice. Role tile wording can become People when Phase 4 implements the fixed-staff model; current roles/status APIs remain as previously recorded until that deliberate change. No merge, push or deployment without authorization.

### Phase 2A closing — Claude, 13 November 2026, head `fb2af2a`

This follows "Codex Phase 2A checkpoint". Only the requested follow-up was made, with no permission or backend changes.

**Messages follow-up (`fb2af2a`, Future F2):**

- The floating Messages shortcut is removed from every workspace screen, and Messages is no longer a sidebar link (`workspaceLinks()`).
- A direct visit to `/members/messages` shows "Messaging isn’t available yet", the published church office email and phone (or a neutral note if none are published), and a "Back to Home" link.
- The browser-only chat prototype is no longer rendered or used from this route. Its local records stay in browser storage, untouched, until Phase 4/F2.
- Help no longer links to Messages, and its note says in-app messaging is planned.
- No chat service, realtime or notification work.
- Tests:
  - `members/messages/page.test.tsx`: the unavailable heading, no textbox or send control, and the Home link.
  - `workspace-shell.test.tsx`: no "Open messages" shortcut, including on the messages route itself.
  - `staff-tools.test.ts`: no Messages entry in the sidebar.

**Evidence (owner's Mac, 13 Nov):**

- `pnpm test`: **21 files, 72 passed** (76 DB tests skipped as designed).
- `pnpm lint`: ESLint `--max-warnings=0` and the full Prettier check pass.
- `pnpm build` is not repeated: `fb2af2a` changes only one client page, the shell markup, a test and CSS, and the build at `5c97de0` passed. Run it with the stopped dev server if Codex wants a fresh build.
- **Owner visual checklist:** the owner replied "done" to the six-item list with no issues reported. Recorded as passing:
  1. narrow-mobile Home (compact calendar, member tools wrapping, menu);
  2. public Locations campus pills and the Join / See dates action spacing;
  3. sign-in verse dots with no extra bar;
  4. profile name legibility and the visible Change photo control;
  5. `/admin/manage` landing at Staff tools for Pastor and Admin;
  6. `/members/messages` unavailable state with no Messages shortcut.

**Remaining 2A limitations, unchanged from the checkpoint:**

- The next-step panel is reachable only through public `?join=` links (2B retargets these).
- The Sunday summary remains on the Calendar page and on public Locations.
- Calendar chips are `aria-hidden`; titles are in the day detail list.
- The unused `.kit-hub*` CSS remains.
- Browser Back cannot be intercepted for a dirty panel.
- Role tile wording stays "Members & roles" / "Member directory" until Phase 4.

**Current next instruction:**

> Codex: brief closing checkpoint of `2b61c56..fb2af2a` (Messages follow-up plus recorded visual evidence). Claude: on acceptance and owner go-ahead, start Phase 2B (structured collections and uniform saves) as written in the revised plan. No merge, push or deployment without authorization.

### Codex Phase 2A closing verdict — 13 November 2026, head `5175cfb`

**Accepted: Phase 2A is closed.** Focused review of `fb2af2a` confirms the floating/sidebar Messages entry is removed, the direct route is an unavailable page without local chat editing/sending, and Help no longer directs users into the prototype. No backend, permission or future-chat implementation added. No blocking finding identified in this closing diff.

Codex reran the affected Messages page, workspace-shell and staff-tools tests: **9 passed across 3 files**; whitespace check passed. Acknowledged the owner/Claude recorded full 72-test suite, lint and six visual checks, without claiming an independent browser walkthrough. The prior stopped-server production build remains the build evidence; no fresh build required for this small reviewed follow-up, and none run. Existing documented limitations remain for their planned phases. Full Phase 2 and production launch remain incomplete.

**Next:** with owner go-ahead, Claude starts Phase 2B from the current reviewed branch, following the active revised plan. Preserve the simplified Home, fixed headings, explicit Save behavior and server-confirmed resource isolation. Move structured collections to real resource-specific APIs/DB; include the agreed video approval boundary rather than retaining an Admin direct-publish bypass. Keep People/care permission work in Phase 4, S3 uploads in 2D and automation/Messenger in Future F1/F2. Update this sole handover with migrations, checks and evidence, then return for a focused slice review. No merge, push or deployment without authorization. Codex changed documentation only in this checkpoint.
