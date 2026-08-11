# Grace Abounds NZ

Grace Abounds NZ is the initial scaffold for a full-stack church website and CMS. The host application is intended to grow to support the public website, church administration, and pastoral workflows. A specifically bounded sermon media-processing subsystem will also form an AUT thesis project; the thesis concerns that subsystem's architecture, not the entire website.

The project is currently in initial scaffolding and development. No CMS features, authentication, business data model, sermon workflow, or media processing has been implemented.

## Architecture overview

The conventional application path is:

```text
Web -> API -> PostgreSQL
```

The proposed, future thesis path is:

```text
Web/Admin -> API -> background queue -> media worker -> FFmpeg -> object storage
                    |                                      |
                    +---------- database/status updates ---+
```

These boundaries keep long-running media work outside the web and API request/response lifecycle. The queue, FFmpeg integration, object storage, and processing workflow shown above are plans, not implemented features.

## Repository structure

- `apps/web`: minimal Next.js and React host for the future public, admin, and pastor interfaces.
- `apps/api`: minimal Fastify/TypeScript server with a development health endpoint.
- `apps/media-worker`: isolated TypeScript process boundary for future media work.
- `packages/database`: shared Prisma/PostgreSQL boundary; intentionally has no models.
- `packages/types`: future shared TypeScript types.
- `packages/validation`: future shared Zod schemas.
- `packages/config`: future shared configuration helpers.
- `packages/ui`: future reusable React components; no design system exists yet.
- `docs/architecture`: high-level boundaries and architecture documentation.
- `docs/thesis`: scope and proposed workflow for the thesis subsystem.
- `docs/api`: future API documentation.
- `docs/decisions`: future Architecture Decision Records (ADRs).
- `infrastructure/docker`: reserved for supporting local Docker files.
- `tests/e2e`: Playwright tests that run against the local web application.

## Prerequisites

- Node.js
- pnpm (Corepack can provide it)
- Docker and Docker Compose
- Git

## Local development

```sh
git clone <repository-url>
cd grace-abounds-nz
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

The placeholder web application runs at `http://localhost:3000`, the API at `http://localhost:4000`, and API health is available at `http://localhost:4000/health`. The worker currently starts and waits for future implementation; it performs no media work.

Use `docker compose down` to stop local infrastructure. The named PostgreSQL volume preserves local data; add `--volumes` only when you deliberately want to delete it.

## Testing and quality checks

```sh
pnpm test          # Vitest unit and React component smoke tests
pnpm test:e2e      # Playwright smoke test against a locally started web app
pnpm lint          # ESLint across applications plus repository Prettier check
pnpm typecheck     # strict TypeScript checks across the workspace
pnpm build         # production compilation of all buildable workspace projects
```

Install Playwright's local Chromium binary once before the first end-to-end run with `pnpm exec playwright install chromium`. A deployment is not required for these tests.

## Environment variables

`.env.example` contains safe development placeholders. Copy it to the ignored `.env` file for local use. Production URLs, database credentials, storage keys, and other secrets must be supplied by the target environment and must never be committed. Browser-visible Next.js variables use the `NEXT_PUBLIC_` prefix and must never contain secrets.

Docker Compose is development-only and provisions only PostgreSQL. Future work may add MinIO so S3-compatible upload and processing behavior can be tested locally without production Cloudflare R2 or Amazon S3; it is intentionally not configured yet.

## Deployment philosophy

Local development is the primary development environment. Normal features must be developed, exercised, linted, type-checked, tested, and built locally before they are pushed. A push must not be required to test ordinary functionality, and production must never be used as a feature-testing environment. Preview or staging validation should occur before production. Deployment configuration is outside the current scaffold.

## AUT thesis boundary

The Grace Abounds website is the host application. The AUT thesis focuses specifically on the proposed sermon media-processing subsystem. Likely architectural concerns include asynchronous processing, API communication, background jobs, media/object storage, FFmpeg, reliability, retry and error handling, scalability, processing status, service separation, and a review/publishing workflow.

None of those thesis features is implemented. Their dedicated service boundary exists now so later research and implementation do not become coupled to normal web requests.

## Development status

Initial scaffold only. The next work should proceed incrementally from documented requirements rather than inventing application features or schemas in advance.
