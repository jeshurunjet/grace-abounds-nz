# UI and CMS audit — 8 November 2026

## Scope and implementation

The seven public pages are Home, About, Locations, Next steps, Giving, Events, and Sermons. This pass preserves the existing visual identity and uncommitted work and changes the local frontend only. No hosting or production deployment was performed.

Pastor, admin, and member now share the same home component, workspace shell, navigation patterns, calendar, messages, resource library, appointments, participation, and event responses. Existing `/admin` and `/pastor` entry URLs still work. Management links are added by role rather than presenting unrelated dashboards. There is no Senior Member role.

The pastor can open the CMS and is the only role with publishing controls. Admins prepare drafts and submit them for review. CMS changes, including visibility changes and archives, stay in a separate public-content snapshot. The published snapshot stays visible until the pastor approves the draft. The preview currently approves the whole website draft together, not individual records. Editing a pending draft returns it to draft and requires resubmission. Pastor feedback is shown to editors.

Staff can preview all seven pages at `/admin/preview`. Public detail pages expose only published records. Draft media and event fields can be reviewed in their editors; unpublished detail-page preview links are intentionally absent.

## Findings and fixes

| Original issue                                                     | Local result                                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Three unrelated role dashboards and navigation systems             | Shared home and shell, with role-based management controls                    |
| Pastor blocked from `/admin` CMS                                   | Pastor and admin can access content editors                                   |
| Admin could publish directly                                       | Separate draft snapshot; only pastor can approve publication                  |
| Role and account controls available to admin                       | Role/account UI restricted to pastor; own/pastor accounts protected in the UI |
| Pastor prayer/appointments disconnected from member submissions    | `/pastor/care` uses submitted member records and saves status updates         |
| Pastor draft sermon links led to a missing public page             | Replaced with staff-only draft review and editors                             |
| Admin calendar maintained an independent temporary dataset         | `/admin/calendar` redirects to events; events supply public/member calendars  |
| Calendars always opened in October 2026                            | Use current month; public events appear in public and member calendars        |
| Group/study links used names the interest form did not recognise   | Interest form includes CMS groups, studies, and next-step journeys            |
| Event registration button had no action                            | Links to member attendance controls                                           |
| Hero title/copy CMS fields did not affect homepage                 | Homepage reads managed content                                                |
| Hero slideshow and community gallery were hard-coded               | Both image collections are editable in CMS                                    |
| About values, images, ministry years, office hours were hard-coded | Connected to structured CMS fields                                            |
| Locations, service times, groups and studies were hard-coded       | Connected to CMS collections                                                  |
| Next-step journeys and public page introductions were hard-coded   | Connected to CMS collections and page fields                                  |
| Giving impact and bank content partly hard-coded                   | Impact, bank details, and verse are CMS-managed                               |
| Directions/contact buttons only displayed mock success             | Directions opens an address-based map; contact goes to contact section        |
| Featured sermon and homepage play button were hard-coded/inert     | Featured published sermon is data-driven and opens detail page                |
| Sermon upload and publishing simulated successful operations       | Honest metadata/media URL editor; direct media playback when a URL exists     |
| Resource download buttons had no files                             | CMS resource collection; real links; honest empty state                       |
| Online giving presented an inert payment form                      | Bank-transfer guidance and giving contact action                              |
| Settings and profile saves claimed success without persistence     | Fake saves removed; configuration limits stated                               |
| Notifications used invented prayer and appointment activity        | Derived from current requests and approval state                              |
| No member message destination                                      | Shared `/members/messages` conversation UI, with staff replies                |

## CMS coverage

| Page       | Managed content                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home       | Hero eyebrow/title/accent/introduction, slideshow images, community gallery, verse; featured sermon and event/sermon lists derive from libraries |
| About      | Introduction, story, hero/story images, ministry years, values, leadership profiles, office hours, shared contact details                        |
| Locations  | Page introduction, campuses, addresses, service times, campus images, connect groups and Bible studies                                           |
| Next steps | Page introduction, journey tabs, headings, descriptions, actions, path steps, member opportunities                                               |
| Giving     | Page introduction, impact breakdown, bank details, verse                                                                                         |
| Events     | Page introduction, event titles/slugs/dates/times/locations/tags/images/summaries/visibility; public calendar derives from events                |
| Sermons    | Page introduction, sermon metadata/slugs/images/summary/direct recording URL/visibility                                                          |
| Shared     | Contact details, footer address, social links, login verses, member download resources                                                           |

Visual layout, navigation labels, decorative headings, standard button labels, and some explanatory/CTA copy remain in code. This is structured content editing, not a general page-layout builder. Image URLs currently support local `/images/` assets and the configured Unsplash host. Uploads, image cropping, arbitrary image hosts, media embeds, drag-to-reorder, fine-grained revision review, and scheduled releases are not implemented. Collections can be added, edited, and removed; at least one required layout item is retained.

## Deployment blockers

The API currently implements only `GET /health`; the Prisma schema has no models. The UI's browser persistence is a prototype, not a production CMS or privacy boundary. Public content is not shared across devices, and local storage is readable by the browser user. Account roles in local CMS records do not change the demo JWT identity. The development sign-in accepts seeded demo accounts and a shared password; authentication also has a development-secret fallback. Replace these before deployment.

Public prayer and contact forms do not deliver messages. Signup, recovery, verification and profile updates still need real account services. Member messages, prayer requests, appointments, applications, assignments, attendance, and roles need server APIs, ownership enforcement, delivery, and durable storage. Do not enter real confidential data into the preview.

Replace invented church history, leadership names/photos, attendance-like claims, campus addresses, service schedules, dates, contact details, social destinations, and bank details with pastor-approved facts. Legal pages remain labelled drafts. A visible working recording requires a real media URL; downloads require real files. Future payment collection requires a payment provider; the current UI uses bank-transfer guidance only.

See `figma-brief.md` for design instructions and `claude-backend-brief.md` for implementation requirements.

## Verification completed

- Production web build passed, including Next.js lint/type validation and all 33 generated routes/pages.
- All 18 unit/component tests passed. Approval tests verify admin publication denial, pastor publication, preservation of the last published revision, and member public-content write denial in the frontend repository.
- Browser checks covered the public home, login, admin home, CMS, staff draft preview, pastor home, member home, and member redirection away from the CMS. A development hot-reload interruption recovered after reload.
- The shared member home screenshot is in `screenshots/shared-member-home.png`. Browser visual review used the available tablet-sized viewport; a full mobile/desktop device matrix and production backend integration checks remain outstanding.
- Whitespace and selected-file formatting checks passed. No production publication was attempted.

## Subsequent reference integration

See [reference-update.md](reference-update.md) for the newer authentication screens, shared shell, Settings, profile-photo cropping, read-only Admin directory and account-confirmation designs. That document supersedes the earlier account/UI limitations above where explicitly stated. Production backend blockers remain.
