# Figma instructions — shared Grace Abounds app

Design refinements for the existing app, preserving its warm cream, olive, dark brown, and gold identity and current fonts. Use the local implementation and `ui-cms-audit.md` as the functional baseline.

Use three roles only: Pastor, Admin, Member. Create one shared home and workspace shell with identical spacing, typography, account controls, navigation behaviour, calendar, messages, resources, and member actions. Show management controls according to permission. Do not design three unrelated dashboards.

Shared navigation: Main website, Home, Messages, Resource gallery, Events & calendar, Help. Add Website content, Manage events, Manage sermons and Member activity for staff. Pastor additionally has Pastoral care, Settings, and role/account controls. On desktop use a consistent sidebar; on mobile use a labelled menu button and dismissible drawer. Preserve clear focus states, keyboard operation, readable contrast, and usable touch targets.

Design the CMS as an extension of this shell. Group content by the seven public pages, plus Shared content. Use readable field labels, collapsible repeatable items, image thumbnails/alt text, clear additions/removals, and unsaved/saving/error feedback. The implemented editor currently autosaves a browser draft; the production design must show persistence status and handle failed saves. Keep layout changes separate from routine content edits.

Show a consistent publishing bar: Published, Unpublished changes, Awaiting pastor approval. Admin can save and submit; pastor can review, return with feedback, and approve publication. Editing after submission invalidates that submission. The live website remains unchanged while revisions are prepared. The current workflow reviews the entire website draft; do not imply that one record can be approved independently until backend support exists.

Provide screens for draft preview across all seven pages, collection editing, empty resources/messages, missing sermon recording, no calendar events, permission denied, loading, failed saves, failed uploads, and pending approval. A future production revision view should clearly identify changed fields and content removed from the live website.

Public CMS coverage must include homepage hero/slideshow and parallax gallery; About story/values/team/images; campuses/service times/groups/studies; next-step journeys; giving information; events/calendar; sermons/media/resources; and shared contact/social content. Keep public and private member resources visibly distinct. Prayer content belongs in pastoral care and must not appear in the public CMS.

Do not show active payment checkout, completed uploads, sent emails, delivered messages, successful password changes, or published content unless the backend confirms that operation. Use honest empty/unavailable states. Do not introduce a Senior Member role.

Deliver a component set and responsive screens at mobile, tablet, and desktop widths, including permission annotations and interaction/state notes for Codex. Use shared components/variants rather than duplicated role frames.
