# Backend and API plan

Planning baseline: 10 November 2026. This is an implementation proposal grounded in the existing frontend, not a list of working endpoints. The API currently exposes only `GET /health`.

## Product rules to preserve

- Exactly three roles: Pastor, Admin, Member. Staff also retain ordinary member features.
- Pastor and Admin manage website content with **immediate publishing**. No submission/approval queue. Keep revision history and recovery without making approval a prerequisite.
- Pastor manages roles, suspension and account removal. Admin's member directory is read-only.
- Prayer requests, appointments and confidential pastoral care belong to the requesting member and Pastor. Do not extend Admin access merely because Admin can edit website content.
- Staff messages are accessible to Pastor/Admin and the member in that conversation; unrelated members cannot access them.
- Services, groups, studies, events and ministries use one Activity model. Calendars are projections of activities, not independent editable copies. A Next steps interest application remains separate from membership or a dated booking.
- Persist success before reporting success. Failed operations retain form input and expose a retry action.

## Application boundaries

Retain Next.js for the frontend, Fastify for business operations, Prisma/PostgreSQL for persistent data and the separate media worker for sermon processing. Use S3-compatible object storage for files. Select storage, email, hosting and queue providers during implementation; none is provisioned by this plan.

Proposed authentication boundary: Next.js/Auth.js owns browser sessions and identity-provider callbacks. Same-origin Next.js route handlers act as a backend-for-frontend gateway for authenticated requests. They validate the session and send a short-lived, audience-scoped signed identity assertion to Fastify over a private connection. Fastify verifies the assertion and loads current account status/permissions before executing business actions. Never trust an unsigned user-ID/role header. Do not forward private service credentials to the browser. Use one identity system; avoid a second independent login system in Fastify.

Public read endpoints may be exposed through the gateway and cached. Authenticated pages/responses are private and must never share public caches. Mutation requests need origin/CSRF controls appropriate to the cookie session. Auth.js owns its protocol routes; authentication route names below express required operations, not a second set of competing OAuth/session endpoints. Confirm the selected adapter supports all required methods before implementing identity.

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

Scheduled public visibility must be checked in server reads (`publishAt <= now`) even if a job is delayed. Release jobs invalidate public caches; cap cache lifetime so jobs alone do not determine visibility. Calendar exports must include cancellation exclusions and modified recurrence instances, with stable UID/sequence data. Calendar export is the first milestone; two-way Google/Microsoft sync is optional later work with its own permissions and conflict policy.

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

## Delivery order and acceptance

| Phase | Scope                                                                           | Exit criteria                                                                                                               |
| ----- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1     | Database, identity, permission middleware, error contracts and audit foundation | Real account/session survives restart; suspension and cross-account denial tested; demo production path removed             |
| 2     | Public CMS, assets and immediate publishing                                     | All seven public pages read shared data; two-device edits persist; version conflict, rollback and cache invalidation tested |
| 3     | Activities, recurrence, exceptions, memberships and bookings                    | DST/exception tests; concurrent last-place test; cancellation/roster/export behavior verified                               |
| 4     | Messages, prayer, appointments, interests, assignments and resources            | Ownership/confidentiality tests; delivery retry and protected downloads verified                                            |
| 5     | Settings, notifications, export/deletion and sermon processing                  | End-to-end real operations, durable jobs, recovery and access revocation verified                                           |
| 6     | Staging acceptance and launch                                                   | Build/typecheck/tests pass; all roles/mobile flows checked; backup restore proven; placeholders reviewed                    |

Before coding identity, settle whether public signup is open or invitation-only and whether an existing church account/Google/storage/email provider must be reused. Proposed default is self-registration as Member only, with staff roles assigned by Pastor. Bootstrap the first Pastor through an audited one-time operator command. Do not block content/API contract work while these provider choices are pending. No payment gateway is proposed: the current Giving page contains editable bank details, not an online payment flow.
