# Frontend readiness — 9 November 2026

## Decision

The existing Next.js frontend is ready to begin backend integration. It is already an interactive local prototype, rather than a collection of static reference screens. It is not yet a production service or a frontend connected to live church accounts/content.

The latest UI change replaces the signed-in public-site bar with a labelled workspace icon immediately beside the profile avatar. The destination uses the authenticated role. The icon stays visible when the mobile navigation is closed, and the old bar and its header offsets have been removed.

## What is in place

- Seven public pages, event/sermon detail routes, shared role home and navigation, member messages, pastoral care, resources, account/profile/settings and recovery screens.
- Structured public-content editing, separate browser draft/published previews, whole-site review state, feedback, validation, failed-storage retry and an actual seven-page staff preview.
- Email-code/Google/passkey/password designs with explicit unavailable-service states. Development demo sign-in creates a local demo session; it does not create a production church account.
- Pastor account-review controls and read-only Admin member management, with role-specific UI and server-rendered route guards for the demo session.
- Local notification preferences, Light/Dark/System appearance, profile image selection/cropping and honest local-preview limits.

## Remaining integration work

| Area                 | Current evidence                                                                                                                | Requirement for a working service                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity             | `apps/web/auth.ts` contains shared demo credentials and a fallback development secret; production login options are unavailable | Real account provider, verified sessions, email challenge delivery/verification, Google and passkeys; disable demo credentials and require a production secret |
| Public content       | `ContentProvider` persists snapshots in localStorage                                                                            | Server repository, schema, migrations, revision IDs, conflict handling and published-content reads shared across browsers                                      |
| Permissions          | Layouts guard role routes, but browser state is not an authority or a private-data boundary                                     | Enforce role and ownership checks on every API operation; protect final pastor and audit changes                                                               |
| Publishing           | Approval changes the preview on this device                                                                                     | Server-approved exact revision, atomic publication, feedback persistence, failure/retry and public cache refresh                                               |
| Member activity      | Messages, prayers, appointments, applications and attendance use browser-local records                                          | Durable APIs, access rules, real delivery/receipt states and notifications                                                                                     |
| Profiles/resources   | Cropping is local; resources need real file URLs                                                                                | Account persistence, signed upload/download access, media processing, avatar refresh and file management                                                       |
| Settings             | Theme works locally; notification preferences are local previews                                                                | Preferences/account/security/session/export/deletion APIs and confirmed delivery channels                                                                      |
| Public rendering/SEO | Sitemap reads seed content and defaults to example.org                                                                          | Published server content, real configured site URL and current published-record sitemap; exclude private settings from indexing                                |
| Launch content       | Legal pages and some church/campus/social/bank/media information remain placeholders                                            | Pastor-approved facts and assets, approved legal copy and real recordings/resources                                                                            |

The API currently implements only `GET /health`, and the Prisma schema contains no application models. These are concrete integration gaps, not missing visual polish.

## Suggested integration order

1. Define shared API contracts and consistent user/profile IDs. Replace the demo identity with real authenticated accounts and enforce permissions server-side.
2. Replace the browser CMS repository with durable drafts, exact-revision review/publication, and server-published reads on the public pages.
3. Connect member messages, prayer/appointments, participation and attendance; then uploads/resources, profile/settings, notifications and account operations.
4. Verify complete journeys across separate browsers/accounts, including rejected requests, expired sessions, failed saves, permission denial and production build behaviour. Finish real mobile-device and accessibility QA before launch.

Keep the existing screens and workflows; adapt the repository/API boundary instead of replacing them with the reference's placeholder pages. See `claude-backend-brief.md` and `reference-update.md` for detailed handover requirements.

## Checks in this review

- Existing header tests verify the workspace icon destination for all three roles and its absence for visitors.
- All 23 unit/component tests passed.
- Static inspection checked 73 literal internal links against the 32 page routes, with no unmatched destinations. Dynamic/generated links still need data-driven integration checks.
- Browser verification confirmed the icon beside the avatar at desktop size and a 390 × 844 mobile viewport, the mobile profile menu, and successful navigation from the public icon to the pastor workspace. This is responsive browser QA, not a physical-device certification.
- Production build and workspace typecheck results are recorded after the final run below.

Final results: production web build passed without warnings, typechecking passed across all workspace packages, and `git diff --check` passed. No production deployment was attempted.
