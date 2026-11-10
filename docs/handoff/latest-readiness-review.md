# Frontend readiness review — 10 November 2026

Reviewed Claude's latest commits `718d119` (unified activities, calendar and bookings) and `ae46b6e` (immediate website publishing), following the earlier audit fixes in `80502eb`.

## Current product decision

The user explicitly confirmed **keep immediate publishing**. Staff website edits no longer require pastor approval. Earlier handover documents describing draft submission and pastor approval are historical and must not be used to restore that workflow. Backend integration should preserve the current role controls and immediate publishing behavior.

## Changes made during this review

- Refresh activity visibility and New Zealand calendar time every 15 seconds and when the browser regains focus. Scheduled activities now become visible while a page remains open, without requiring a content edit or reload.
- Restore a valid blank draft profile when adding a team member to an empty CMS team collection.
- Update the member engagement test for the unified Activities & bookings interface.
- Add tests covering New Zealand daylight saving, weekly/fortnightly/monthly recurrence, occurrence exceptions, per-date capacity, scheduled visibility and single-date calendar export. Add a hook regression test for scheduled release without a page reload.

## Verification

- Workspace TypeScript check: passed.
- Unit/component tests: **30 passed across 11 files**.
- Browser: inspected the updated pastor Activities & calendar page, including schedule controls, visibility, upcoming date exceptions, booking roster and capacity fields. This was a focused inspection; it is not a complete click-through of every route or action.
- Production build and full end-to-end suite were not run during this review. The running development server was left in place.

## Readiness verdict

The frontend provides a usable foundation for backend integration. It is not ready for a production launch or a blanket functional sign-off.

Outstanding implementation work:

1. Replace demo credentials and the development authentication secret fallback before production. Connect real sessions, email codes, Google OAuth and passkeys.
2. Implement the database and API: the Prisma schema currently has no models and the API exposes only a health endpoint. CMS content, participation, messages and pastoral care currently rely on browser storage.
3. Enforce staff/member permissions and booking capacity on the server. Add audit records for immediate staff publishing and account operations.
4. Connect uploads, notifications, delivery, account deletion and data export. Confirm success only after the server accepts each operation.
5. Review migration of existing preview data: ContentProvider reads content-v4 but does not read content-v3. Older saved browser content will not automatically carry into the new model. Design a migration if existing preview records matter.
6. Verify series calendar exports for changed occurrences: the export handles cancelled dates, but modified times/venues need recurrence overrides. Keep the current “no Google or Outlook sync yet” message until actual synchronization exists.
7. Run a production build and browser acceptance checks for Pastor, Admin and Member, including mobile layouts, persistence failures, capacity conflicts and all seven public pages.

Immediate publishing is intentional. Validation warnings currently do not provide a publish gate, so backend integration should define how invalid/incomplete edits are rejected while preserving the user's chosen publishing workflow.
