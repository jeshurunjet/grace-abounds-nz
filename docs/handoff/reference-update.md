# Reference design integration

The updated `design-reference/GraceAbounds/src.zip` was inspected and relevant designs were integrated into the existing Next.js app. The reference remains unchanged. The working shared home, event calendars, member messages, typed CMS data and actual seven-page staff preview were retained.

## Added

- Shared workspace top bar, line icons, grouped navigation, account Settings link, and mobile drawer with Escape/keyboard focus handling.
- Session-based public website bar with a return-to-workspace link.
- CMS page-navigation sidebar, content image previews, browser storage failure notices and retry. Failed browser saves prevent review submission and approval.
- Personal `/settings` for every signed-in role, with Light/Dark/System theme selection shared with the floating theme toggle; local notification preferences by account; Google, passkey, session, export and deletion states. `/admin/settings` redirects here; pastor administration stays separate from personal settings.
- Redesigned login/signup with email entry, six-digit verification code UI, paste/keyboard support, resend/change-email states, Google option, passkey option, and password alternative. None of these production methods currently authenticate a church account. Seeded demo login remains clearly separated under Developer demo access and its UI is omitted from production builds. The demo backend itself still requires replacement before deployment.
- Shared-shell profile editing as an explicitly temporary preview. Profile photos accept JPG/PNG/WebP up to 5 MB, validate decoding/dimensions, support drag-and-drop and zoom, and generate a real 512px centre crop. Nothing is uploaded or saved to the account.
- Member search and role/status filters, no-results state, account details, and pastor-only review dialogs for role, access and deletion changes. Admin member management is read-only. Account changes are not simulated; the dialogs leave identity data unchanged. Own/final-active-pastor protections are shown in the UI and still require backend enforcement.
- Accessible reusable dialogs rendered at the document root to avoid clipping by profile cards and workspace containers.

## Intentionally retained or deferred

The reference's disconnected message/calendar placeholders, separate role dashboards, generic CMS field-key storage and sample seven-page preview were not adopted. The current implementation keeps its connected browser-preview features. Some existing member activity operations remain browser-local prototypes; none is a cross-device service.

Google OAuth, email code delivery/verification, passkey registration/assertions, password authentication for actual members, secure account changes, notification delivery, file uploads, export/deletion and production publishing remain backend work. Production operations must not show success before a verified server response. The local approval button is labelled “Apply approved preview” to distinguish it from production publication.

## Backend integration requirements

- Email codes: server-issued single-use challenges, expiry, attempt/resend limits, account enumeration protection and session establishment only after verification.
- Google: provider configuration, state/PKCE as applicable, verified identity, explicit account-linking rules and callback errors. No role selection in production login.
- Passkeys: server-issued WebAuthn registration/authentication challenges and verified responses; secure origin/RP configuration, registered credential list, naming/removal, recent-authentication checks and an account recovery path.
- Personal settings: durable preference APIs and explicit delivery availability. System theme continues tracking operating-system changes on this device.
- Account management: authoritative role and suspension updates, active-session revocation where appropriate, audit records, deletion/data retention/export policy, recent authentication and final-pastor protections.
- Profile/media: upload API, cropped image persistence, metadata validation, shared avatar refresh and failure states. Current profile edits reset on reload/navigation.
- Publishing: replace browser snapshots with versioned server drafts and exact-revision approval; keep public content stable while drafts change.

## Verification

Unit tests cover six-digit entry and unavailable authentication methods, Admin read-only management, pastor confirmation without false identity updates, and retry after failed CMS storage. Browser QA covers the new sign-in/code screens, Settings and passkey unavailable state, profile photo dialog, shared pastor shell and CMS navigation. Full live-provider authentication and uploads cannot be verified before backend integration.

### Continuation check — 9 November 2026

Checked the existing implementation before continuing. Removed the remaining theme-context and drawer-focus build warnings. Updated older prayer, appointment, participation, attendance and review-feedback confirmations to explicitly describe browser-only preview activity, with no delivery claim. Member mutations now wait for preview readiness and pause on a browser-storage error.

Final verification: production web build passed without warnings, all 23 tests passed, and `git diff --check` passed. No backend services or production deployment were added. Full mobile-device testing and live-provider integration remain outstanding.


### Public navigation refinement — 9 November 2026

The public return-to-workspace bar was replaced by an accessible dashboard icon beside the profile avatar, including on mobile. The icon uses the authenticated role destination. See `frontend-readiness.md` for the current integration assessment and validation results.
