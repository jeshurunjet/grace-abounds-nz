# Routes and admin controls audit — 9 November 2026

## Verdict and method

The frontend is ready to serve as the starting point for backend integration. It is not yet ready to be signed off as a complete working frontend, and not every admin control has correct end-to-end behaviour. Fix the concrete frontend defects below before freezing the UI contract for Claude.

This review inspected all 32 page routes and their shared controls/handlers, checked literal link destinations, and reran the existing automated suite and workspace typechecking. It is a source/automated-test audit, not a claim that every control was clicked in a browser. Existing browser evidence from earlier passes covers the public/role shell, CMS preview, authentication UI, Settings and profile dialogs; the remaining workflows still need focused browser acceptance tests. No application code was changed during this audit.

## Frontend defects and workflow problems

### High priority: fixed record fields are exposed as variable collections

`admin/cms/page.tsx` handles every array with the same recursive `Fields` component. This includes the inner tuples that represent group fields, Bible-study fields, About values and giving-impact fields. For example, one group is `[name, leader, schedule, area]`, but the editor allows its individual fields to be reordered, removed and extended as if each field were another group. The public page still destructures the array in its original order.

Result: clicking Move up inside a group can turn the schedule into a leader name; removing a field can blank/mislabel public content; adding an extra field can produce content the public page ignores. The validator does not reject these malformed tuples.

Action: distinguish repeatable records from the fixed named fields within each record. Prefer object records with semantic labels and schema validation. Allow adding/removing/reordering whole groups or values, not their constituent fields.

### High priority: draft detail links exit the draft preview

`/admin/preview` renders the selected public page with the draft snapshot, but event/sermon cards and other public links retain their normal public URLs. `ContentProvider` switches to the published snapshot outside `/admin`. Event/sermon detail pages require published records.

Result: a newly created event marked for inclusion in the draft appears in the staff preview, but its View details link opens `/events/<new-slug>` against the old published snapshot and can show 404. Existing-record links show the old version. This is a working page preview with an incomplete navigation model, not a complete site-wide revision preview.

Action: introduce authenticated draft-detail routes or a staff-only preview context that persists through internal navigation. Keep draft records inaccessible on public URLs. Preview form actions should also be disabled or explicitly preview-only.

### Medium priority: the seeded Scheduled status has no corresponding editor option

The data model and seeded event/sermon records include `scheduled`, while both editor visibility selects only offer draft/published/archived. The select cannot faithfully display that existing value, and no scheduled-release time or scheduler exists.

Action: either migrate legacy scheduled records to a supported state and remove the promise of scheduling, or implement a coherent scheduled-release workflow. Do not silently show a different selected state than the record contains.

### Medium priority: event response links can lead to an event the member cannot respond to

Every public event detail page links to `/members#attendance`. The attendance list displays only the first four published events. A published event outside that slice has no response control on the destination page. The link also does not identify which event was selected.

Action: provide an event-specific response route/control, or pass an event ID into a complete searchable attendance list.

### Medium priority: the publishing toolbar appears on unrelated admin operations

`AdminShell` always renders `EditorialBar`, including on `/admin/users`. A member record, appointment-status change or assignment is outside the public publishing snapshot, yet the user sees website approval controls at the top of that screen.

Action: show the editorial toolbar only on CMS/events/sermons/preview pages. Render member management in the same visual shell without implying that private member activity is part of website publication.

### Medium priority: error handling is inconsistent outside the CMS

CMS publication checks `storageError`, but `/admin/users` appointment/application/prayer status handlers and Add assignment do not check readiness/storage failures. Add assignment resets the form and reports success immediately after calling the browser repository. Messages similarly lacks the CMS storage-error notice/retry pattern.

Action: use consistent persistence results across all write flows. Preserve entered text on failure and only confirm what actually succeeded. Keep the existing explicit browser-preview caveats until server APIs exist.

### Secondary data/UX concerns

- Admin assignment dates are free text. The member planner matches assignment month/day without a year, so an assignment can appear in another year. Use a canonical ISO date plus timezone-aware scheduling.
- Generic CMS collections clone the last object on Add item. Leadership copies keep the last profile's content and published visibility until changed. New records should start blank or with clear defaults and draft visibility.
- Most collections cannot remove the final record, even where an empty state should be legitimate (e.g. groups/studies). Define required versus optional collections rather than applying a universal minimum of one.
- Member opportunities are managed partly in a separate pipe-delimited field and partly derived from journeys/groups/studies. Consolidate their source of truth or document their distinct purposes to avoid conflicting labels/descriptions.
- Sermon editor summary is a single-line input; use an appropriate long-text field. Events/sermons have limited search/filter and empty-library guidance as collections grow.
- Approval currently permits a pastor to apply a draft directly without a pending submission. This can be reasonable for the pastor's own edits, but the intended rule must be explicit before implementing exact-revision server approval.

## Admin control inventory

| Route / controls                                                      | Current behaviour                                                                      | Assessment                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/admin` home, calendar navigation, resource/message/member shortcuts | Shared member-home implementation with staff additions                                 | Sensible shared experience; not a separate duplicate dashboard                      |
| `/admin/cms` page selectors, field edits, image thumbnails            | Edit the browser draft using typed page data                                           | Functional prototype; fixed-field collection defect must be corrected               |
| CMS Add/Remove/Move up/down                                           | Mutate arrays; boundary moves/final-item deletion disabled                             | Work mechanically; semantics are unsafe for fixed tuples                            |
| CMS Submit for approval                                               | Sets whole-site pending state locally; disabled after storage errors/validation errors | Preview only; no request delivered across devices                                   |
| Pastor Apply approved preview                                         | Replaces this device's published snapshot; admin cannot invoke through its UI          | Preview only; no server publication                                                 |
| Pastor Return to draft                                                | Adds local feedback and restores draft state                                           | Preview only; no notification delivery                                              |
| Retry save                                                            | Reattempts browser storage                                                             | Covered by existing storage-failure test                                            |
| Preview draft / View live version                                     | Navigate to staff preview and public pages                                             | Destinations valid; preview detail navigation is incomplete                         |
| `/admin/events` New event, record selectors, fields, visibility       | Creates/edits draft events locally                                                     | Functional prototype; scheduled-value mismatch, limited validation/empty-state UX   |
| `/admin/sermons` New sermon, selectors, metadata/media URL/visibility | Creates/edits draft sermons locally                                                    | Functional metadata editor; no upload/transcode service; scheduled-value mismatch   |
| `/admin/users` search, role/status filters, account selection         | Filter/select local seeded records                                                     | Sensible; no-results state exists                                                   |
| Admin member-management controls                                      | Read-only; private prayer section hidden                                               | Matches latest agreed role design; server data filtering still required             |
| Pastor role/access/deletion review                                    | Opens guarded confirmation dialog; completion reports unavailable and changes nothing  | Intentional backend-dependent design; these are not functioning identity operations |
| Pastor activity status and Add assignment                             | Changes local member records                                                           | Needs persistence/error/date corrections above                                      |
| `/admin/calendar`                                                     | Redirects to `/admin/events`                                                           | Harmless compatibility alias; no disconnected second calendar                       |
| `/admin/settings`                                                     | Redirects to `/settings`                                                               | Harmless compatibility alias; one personal-settings implementation                  |
| `/admin/preview` seven page links                                     | Render seven selected draft pages                                                      | Functional top-level preview, incomplete through-navigation                         |

## Complete page-route inventory

| Group                      | Routes                                                                                                                            | Status                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Public core (7)            | `/`, `/about`, `/location`, `/next-steps`, `/give`, `/events`, `/sermons`                                                         | Implemented; most content is CMS-connected in browser preview                                        |
| Public details (2)         | `/events/[slug]`, `/sermons/[slug]`                                                                                               | Published records only; draft-link problem described above                                           |
| Legal (2)                  | `/privacy`, `/terms`                                                                                                              | Implemented routes with explicitly draft content                                                     |
| Account entry/recovery (5) | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`                                                       | New-method screens/unavailable states; demo session only; not real account lifecycle                 |
| Shared member area (3)     | `/members`, `/members/messages`, `/members/gallery`                                                                               | Browser-preview activity and resources; no durable delivery/download access control                  |
| Personal account (3)       | `/profile/[id]`, `/settings`, `/help`                                                                                             | Profile/photo preview; real local theme; local settings preferences and unavailable account services |
| Pastor area (2)            | `/pastor`, `/pastor/care`                                                                                                         | Shared home plus local care-record management                                                        |
| Admin area (8)             | `/admin`, `/admin/cms`, `/admin/events`, `/admin/sermons`, `/admin/users`, `/admin/preview`, `/admin/calendar`, `/admin/settings` | Controls and aliases detailed above                                                                  |

## Redundancy assessment

Useful repetition to keep: the three role entry URLs intentionally reuse one home; sidebar shortcuts and CMS Events/Sermons links lead to the same editors; calendar/settings aliases redirect rather than maintaining duplicate state.

Redundancy to reduce: public publishing controls on member-management screens; prayer-status editing in both member management and pastoral care unless a clear per-member-detail versus global-work-queue distinction is maintained; overlapping separately maintained opportunity descriptions. None requires three different role dashboards or a Senior Member role.

## Implementation readiness

UI foundation: ready to continue implementing. Frontend functional sign-off: not yet, because of the defects above. Production launch: not ready.

The API still exposes only `GET /health`; the Prisma schema has no application models. Real identity/session enforcement, database-backed drafts and publishing, uploads/protected files, notifications/email, messages, account management/export/deletion and audit logs remain required. Browser-local data is not a privacy boundary. The demo credentials and development-secret fallback must not remain available in production.

Recommended next pass: (1) repair CMS record editing and preview navigation; (2) resolve scheduling and event-specific responses; (3) remove irrelevant toolbar/redundancy and unify write-error handling; (4) freeze the API contracts and connect backend features; (5) run browser acceptance tests across all roles and separate sessions/devices. Existing unit tests establish a useful baseline but do not cover all these workflows.

## Validation

Literal link scan: 73 references checked against 32 page routes; no unmatched static destinations. This does not prove dynamic records exist or preview context is preserved. Test/typecheck results are recorded below after completion.

Final checks: all 23 tests passed; typechecking passed across the workspace after quarantining 12 byte-identical duplicate files from the ignored `.next/types` generated folder. The duplicate files were preserved in a temporary backup, not deleted. No application source changes were made. The current unit suite does not exercise the malformed tuple editing, full preview navigation or all event response scenarios, so passing it does not resolve those findings.
