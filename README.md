# Grace Abounds NZ

A church website and shared workspace for **Pastor, Admin and Member**, built with Next.js, React and TypeScript. The public website and role-based frontend are implemented as a development prototype. The Fastify API and media worker are scaffolds; durable backend features are not implemented yet.

## Current features and limits

- Seven main public pages: Home, About, Locations, Next steps, Giving, Events and Sermons; event/sermon detail pages and privacy/terms pages.
- A shared responsive workspace with role-based navigation, messages, resources, pastoral care, member management, profiles and settings.
- CMS controls for public page content, shared settings, imagery, team profiles, resources and sermons.
- Unified activities for services, connect groups, Bible studies, events and ministry teams, with recurring schedules, date exceptions, memberships, bookings and capacity controls.
- Authentication screens for email codes, passwords, Google and passkeys. Only the demo credentials provider currently authenticates users.

**Staff edits publish immediately.** Pastor and Admin can manage website content; there is no pastor approval queue. Draft/archived records remain hidden, and activities can have a scheduled release. Pastor retains role and account-management authority; Admin's member directory is read-only.

CMS and member activity currently persist in browser local storage, not a shared database. Role checks in the UI are not production authorization. Email, Google/passkeys, uploads, notifications, account export/deletion and media processing require backend implementation. Google/Outlook calendar synchronization is not connected.

## Architecture

Current preview: Next.js frontend → browser storage, with Auth.js demo sessions. The separate API exposes only `GET /health`; Prisma has no business models.

Planned production path:

```text
Browser → Next.js (public pages + session/API gateway) → Fastify API → PostgreSQL
                                                           ↓
                                                    durable job queue
                                                           ↓
                                               media worker → object storage
```

See the [project handover](docs/handoff/PROJECT-HANDOVER.md) for the proposed contracts, permissions, database entities and implementation order. This architecture is a plan, not an implemented connection.

## Repository

| Path                                    | Purpose                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `apps/web`                              | Public website, CMS and shared role-based workspace       |
| `apps/api`                              | Fastify API scaffold, currently health only               |
| `apps/media-worker`                     | Reserved process for asynchronous sermon media processing |
| `packages/database`                     | Prisma/PostgreSQL boundary; no business models yet        |
| `packages/types`, `packages/validation` | Boundaries for shared contracts and validation            |
| `packages/config`, `packages/ui`        | Shared package scaffolds; current UI lives in the web app |
| `docs/api`                              | Backend plan and proposed API contracts                   |
| `docs/handoff`                          | Single Claude/Codex handover and backend plan         |
| `docs/thesis`, `docs/architecture`      | Thesis scope and architectural background                 |
| `tests/e2e`                             | Playwright browser tests                                  |

## Run locally

Use Node.js compatible with the installed dependencies, pnpm (pinned in `package.json`), and Docker Compose if running PostgreSQL.

```sh
corepack enable
pnpm install
# Only when .env does not already exist:
cp -n .env.example .env
pnpm dev
```

The web preview is at `http://localhost:3000`; the API health endpoint is `http://localhost:4000/health`. The worker currently prints a startup message and exits without doing media work. PostgreSQL is not required for the browser-only preview. To start the reserved local database:

```sh
docker compose up -d
```

`docker compose down` stops PostgreSQL while preserving its named volume. Adding `--volumes` deletes that local database data.

### Demo access

Open **Developer demo access** on the login page. All three development accounts use password `grace-demo`:

| Role   | Email                |
| ------ | -------------------- |
| Member | `member@example.org` |
| Pastor | `pastor@example.org` |
| Admin  | `admin@example.org`  |

These are public development credentials. They must be disabled in production. Preview data is local to the browser and should not contain real confidential information.

### Environment configuration

Use `.env.example` as the development template; never commit real secrets. Set a unique `AUTH_SECRET` for each environment. Next.js uses its own environment-file loading; other processes must receive their environment explicitly. Copying the root `.env` does not by itself guarantee every workspace process loads it.

For example, when starting only the web app locally:

```sh
AUTH_SECRET=your-local-random-secret pnpm --filter @grace-abounds/web dev
```

The current auth module has a development secret fallback that must be removed before production. `NEXT_PUBLIC_*` variables are browser-visible and must never hold secrets. `.env.example` includes reserved database/API settings; not every setting is wired to application behavior yet.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
```

`pnpm lint` includes the repository-wide Prettier check. Playwright's config starts the local web server or reuses an existing one outside CI. Install its Chromium binary once with `pnpm exec playwright install chromium`.

The latest focused frontend review passed TypeScript and 30 unit/component tests. This is not a complete browser acceptance test or production deployment sign-off. See the [project handover](docs/handoff/PROJECT-HANDOVER.md) for scope and outstanding work.

## Backend implementation and launch

Start with the [single Claude/Codex project handover](docs/handoff/PROJECT-HANDOVER.md). Preserve the current UI and immediate publishing behavior. Earlier handovers describing pastor-only publishing approval are superseded.

Before launch, implement real identity and server permissions, database persistence, media storage, notifications and recovery/backup processes. Verify all roles and public pages in staging, remove demo access, and replace placeholder church, banking and legal content. Develop and test locally before staging or production.

## AUT thesis boundary

The website is the host application. The AUT thesis concerns the sermon media-processing subsystem: asynchronous jobs, API communication, FFmpeg processing, object storage, status tracking, retries and reliability. The worker boundary exists, but processing is not implemented. Any media readiness/review checks are separate from the website publishing workflow; they must not reintroduce a pastor approval queue for ordinary CMS edits.
