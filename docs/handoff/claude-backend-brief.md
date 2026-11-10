# Claude backend implementation brief — Grace Abounds

Updated 10 November 2026. Read the [backend/API plan](../api/backend-plan.md), [current readiness review](latest-readiness-review.md) and root README before implementing. They supersede older draft/approval instructions in the handover archive.

## Preserve the current product

- Roles are Pastor, Admin and Member only. Reuse the shared frontend; do not redesign the app as part of backend work.
- **Pastor and Admin website edits publish immediately.** The user explicitly chose this workflow. Do not implement submission, approval or rejection endpoints. Retain hidden drafts, archive states, activity scheduled releases, revision history and audited restore.
- Pastor controls roles and account management. Admin member management is read-only. Staff retain member features.
- Keep prayer requests, appointments and pastoral notes restricted to their member owner/Pastor as appropriate. Admin CMS access does not grant pastoral access. Pastor/Admin can handle member conversations.
- Use unified activities for services, groups, studies, events and ministries. Derive public and member calendars from that source. Keep Next steps interest applications distinct from bookings/memberships.

## Inspect these sources before changing contracts

- `apps/web/app/lib/content.ts` and `page-content.ts`: existing content and member records.
- `apps/web/app/lib/activities.ts`: recurrence, memberships, bookings and exceptions.
- `apps/web/app/components/content-provider.tsx`: current browser repository and legacy data handling.
- `apps/web/auth.ts`: demo-only identity, secret fallback and prototype ID mapping.
- Current CMS/activity/sermon editors, member features, settings and authentication screens.

Fastify currently implements only a health endpoint, Prisma has no business models and the media worker does no processing. Authentication UI is not proof that email codes, Google or WebAuthn work.

## Implementation approach

Follow the phases and contracts in the API plan. Start with schema, real identity, server-enforced permissions and typed errors. Then connect public content and immediate CMS writes, followed by activities/bookings, member communication/care and remaining account/media operations. Keep each phase runnable and independently reviewable.

Use the proposed Next.js session gateway/Fastify business boundary unless repository evidence requires a documented alternative. Verify identity assertions and current account status; never trust a browser-supplied user ID, role or unsigned gateway header. Use one canonical user identity, resolve demo profile IDs explicitly, and remove shared demo credentials/secret fallback from production.

Use resource-specific read/write contracts rather than persisting the entire mixed ContentState. Validate schemas and domain rules on the server. Use version preconditions for concurrent CMS edits, database transactions for capacity/uniqueness and an outbox for reliable job delivery. Store recurring times in Pacific/Auckland wall-clock terms and release instants in UTC; preserve original occurrence identity through exceptions.

Provide migrations, development seeds and an explicit import strategy for older browser content. Never overwrite real data with seeds at startup. Replace browser storage incrementally behind typed frontend adapters. Show operation success only after server confirmation; preserve input and support retry on failures.

Keep media processing asynchronous in the worker. Implement signed uploads, protected member downloads, verified assets and durable processing status before treating media as ready. Account export/deletion, notifications and email also need durable job states; `202 Accepted` is not completed delivery.

## Required validation and handover

Test role/ownership denial, guessed private IDs, suspension/session revocation, final-Pastor protection, immediate Admin/Pastor publishing, stale CMS writes, restore, public/private caching, recurrence/DST, concurrent capacity claims, cancellation and notification retries. Verify content survives restarts and appears across devices. Use appropriate contract/integration tests, then complete browser acceptance for all three roles.

Document actual environment variables, provider setup, migrations, backup/restore, worker operation and unresolved choices. Do not deploy production merely because the frontend renders. Include a field-to-contract inventory covering every CMS field across all seven public pages and shared content. Keep the AUT thesis scope limited to the sermon media subsystem.
