# Backend progress

## Phase 1 — identity, permissions, API foundation (branch `backend-phase-1`)

Status: code written, awaiting first install/migration on the owner's Mac.

- [x] Agreed plan recorded (`backend-implementation-plan.md`)
- [x] Prisma schema: User (role, status, version), Auth.js tables, passkeys, AuthAttempt, AuditEvent
- [x] Auth.js: six-digit email code (provider `email-code`), Google (when configured), passkeys; database sessions; suspended accounts blocked
- [x] Code limits: 5 code requests/hour and 5 wrong guesses/15 min per email (then all codes voided); 10-minute expiry
- [x] `staff:add` operator command (fixed Pastor/Admin; protects last Pastor) and empty-database dev seed
- [x] Next.js `/api/v1/*` gateway: same-origin check for mutations, 60s signed identity assertion, private no-store
- [x] Fastify: assertion verification + live status/role load, `requireActor`/`requireRole`, error envelope, request IDs, `/health`, `/ready`
- [x] `GET/PATCH /v1/me` (If-Match versioning, audited) and `PATCH /v1/pastor/members/:id/status` (suspend/reactivate, ends sessions, self/last-Pastor protection)
- [x] Login/sign-up wired to email code, Google, passkey; Settings → Passkeys registers a passkey; password and demo sign-in removed; forgot/reset-password redirect to login
- [ ] First run on the owner's Mac (steps below) and fixes from typecheck
- [ ] Tests: identity denial, suspension, version conflict, code limits
- [ ] Owner verification: real account survives restart; suspension and cross-account denial

### Not yet connected (later phases)

Member data shown in the app (activities, messages, CMS) still comes from browser storage until Phases 2–4. Profile pages for new accounts fall back to the role's demo profile until profiles move to the API.

### First run (owner's Mac)

```bash
cp .env.example .env            # then set AUTH_SECRET and API_ASSERTION_SECRET:
openssl rand -base64 48         # run twice, paste one into each
docker compose up -d            # PostgreSQL
pnpm install                    # installs new packages, generates Prisma client
pnpm --filter @grace-abounds/database migrate -- --name phase1_identity
pnpm --filter @grace-abounds/database seed      # dev accounts (empty DB only)
pnpm typecheck
pnpm dev                        # web :3000, api :4000
```

Sign in at http://localhost:3000/login with `pastor@example.org`, `admin@example.org` or `member@example.org`; the six-digit code prints in the web server output.

Real staff accounts: `pnpm --filter @grace-abounds/database staff:add -- --email you@domain --role pastor --name "Full Name"`.
