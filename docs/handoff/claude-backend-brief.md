# Claude backend instructions — Grace Abounds

Implement the backend for the existing Next.js frontend, Fastify API, and reserved media-worker boundary. Read `reference-update.md` first for the latest UI changes, then `ui-cms-audit.md`, `apps/web/app/lib/content.ts`, `page-content.ts`, and `components/content-provider.tsx` before changing contracts. The API currently has only a health endpoint; Prisma has no models. Preserve the current UI and provide a migration path from its seed data. Do not treat browser role checks or local storage as authorisation.

## Roles and access

Use Pastor, Admin, Member only. Pastor has full app authority and is the sole publishing approver. Admin can create/edit all public CMS content and submit changes, but cannot publish, unpublish, delete live content, approve themselves, grant roles, suspend accounts, or change security settings. Members can use their own messages, prayers, appointment requests, applications, attendance responses, assignments, profile, and member resources. Pastor/admin retain ordinary member features.

Derive identity and role from a verified session on every operation; ignore client-supplied role, sender, owner, approver and publication authority. Add record-level ownership checks, confidential-data filtering, and tests for guessed IDs. Current UI assumes prayer requests are pastor-only; member messages are visible to pastor and admin. Confirm any broader prayer access policy with the owner before expanding it. The current Admin member-management view is read-only; any operational write access needs an explicit permission decision. private pastoral notes must have separate authorisation. Role changes and suspension must update effective authentication, not just a CMS record. Protect the final active pastor and prevent self-lockout.

## Public content and editorial workflow

Model public page content, repeatable collections, events, sermons, team, resources, and shared settings with stable IDs. Keep draft revisions separate from the published snapshot. Support draft, pending review, published revision, returned-with-feedback, and archived content. A change to a live record remains unpublished until pastor approval, including archive/removal/unpublish. Editing a submitted draft invalidates approval and requires resubmission.

The current UI submits one complete website draft. Implement atomic snapshot approval first, or update the UI explicitly if introducing per-record review. Approve an exact revision ID/version in a transaction; prevent stale approvals and concurrent-edit overwrite with optimistic locking. Record actor, timestamp, changed records, feedback and publication audit events. Public reads must query only the published snapshot; staff preview requires staff authorisation and must not leak through public caches, detail URLs, sitemap, search or media endpoints. Rejection must preserve the published version.

Expose typed read/draft-update/submit/review/publish operations and replace the browser repository behind ContentProvider. Keep member activity outside public publishing transactions. Preserve data during migration and avoid seeded demo content replacing stored production content. Do not claim successful save/publish before server confirmation.

## Required durable features

- Verified accounts, invitations/signup policy, secure password handling, email verification, password reset, session revocation, rate limits, and explicit development-only demo mode. Production must require a real secret and disable shared demo credentials.
- Shared messages with sender ownership, conversation access, staff replies, delivery state, pagination and notifications.
- Private prayer intake, member ownership and pastor review; optional anonymous/guest intake requires explicit rules, abuse controls, retention policy and clear confidentiality text.
- Appointment requests and status, member applications, service assignments and attendance; each record must have one canonical identity mapping. The prototype has separate demo user/profile IDs—resolve this during migration.
- Contact inbox and email delivery with confirmed success/failure states. Public forms currently do not deliver anything.
- Events as the canonical public calendar source. Use ISO dates/times and Pacific/Auckland timezone semantics, including daylight saving, recurring events if required, and correct upcoming-event ordering. Do not maintain a second disconnected calendar dataset.
- Resource file records and protected member downloads. Never rely on obscured public URLs for access control. Gallery images intended for the public website can be public assets.
- Media storage/uploads and async processing in the worker. Signed uploads, size/type validation, ownership, progress/failure/retry, poster generation, accessible playback/captions as needed. Validate direct media URLs and avoid arbitrary server-side URL fetching.
- Profile persistence and support contact configuration. Approved privacy/terms and retention/deletion processes before launch.

Validate payloads on the server: content shapes, required fields, unique slugs, valid dates, safe URLs, file metadata, image alt text, collection ordering and limits. Avoid silently converting user-entered content into HTML. Add CSRF/origin protections appropriate to the auth mechanism, request limits, structured errors, and safe logs without private message/prayer bodies.

Integrate one feature at a time and replace misleading frontend success states. Add contract/integration tests for admin publication denial, pastor approval, member cross-account denial, private prayer/media access, concurrent draft edits, rejected approval, live revisions remaining stable, role revocation, and data surviving restarts. Finish with migration/backup instructions, environment configuration, and a deployment smoke-test checklist. Do not deploy production until demo identity, browser-only persistence and placeholder church/bank/legal information are resolved.
