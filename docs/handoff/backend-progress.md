# Backend progress and next steps

Last updated 10 November 2026.

## Where things stand

- `main` holds the final frontend UI (commit `590f1bd`) and these handover
  documents. Nothing backend-related is merged.
- Branch `backend-phase-1` (commit `1d5a147`) contains a **first draft of
  Phase 1 written before planning finished**. It has not been installed,
  migrated or run. It must be revised (or discarded) because it removed
  password sign-in, which the owner wants to keep.
- Local commits are not yet pushed to GitHub (`origin`). Push from the
  owner's Mac: `git push origin main` and, if keeping it,
  `git push -u origin backend-phase-1`.

### What the Phase 1 draft already contains

- Prisma schema: User (role, status, version), Auth.js tables, passkeys,
  AuthAttempt (rate limits), AuditEvent
- Auth.js with six-digit email codes (`email-code` provider), Google (shown
  only when configured) and passkeys, on database sessions
- Code limits: 5 requests/hour, 5 wrong guesses/15 min (then all codes
  voided), 10-minute expiry
- `staff:add` command (fixed Pastor/Admin; protects the last Pastor) and an
  empty-database development seed
- `/api/v1/*` gateway with signed identity assertions; Fastify identity
  checks, role guards, error envelope, request IDs, `/health`, `/ready`
- `GET/PATCH /v1/me`; `PATCH /v1/pastor/members/:id/status`
- Login/sign-up wired to email code, Google and passkey; passkey
  registration in Settings; sign-up name saved after first sign-in
- **Removed in the draft (must be restored):** password sign-in, forgot
  password and reset password screens; also removed demo sign-in

## Next steps

1. **Owner:** answer the open decisions in
   [backend-implementation-plan.md](backend-implementation-plan.md)
   (password at sign-up, reset by code or link, revise or discard the
   branch) and say when to start.
2. **Agent:** revise Phase 1 for passwords:
   - add a password hash to User and a `sessionVersion`
   - switch Auth.js to JWT sessions checked against `sessionVersion`
   - add the Credentials (email + password) provider with Argon2id
   - restore the password, forgot-password and reset-password screens,
     wired to real endpoints, with rate limits and session revocation
   - keep email code, Google and passkeys
3. **Agent:** add Phase 1 tests: identity denial, suspension, version
   conflicts, code/reset limits, password reset revoking sessions.
4. **Owner:** run the first setup (below) and send back any errors from
   `pnpm typecheck` or `pnpm dev`. Agent fixes them.
5. **Owner:** create the Google OAuth client (steps below). Later, create a
   Resend account and add its DNS records to the church domain.
6. **Owner verifies Phase 1:** a real account survives a restart; a
   suspended account is locked out; one member cannot read another's data.
7. Then Phase 2 (website content and images; S3 setup).

## First setup on the owner's Mac (when Phase 1 is ready)

Run one at a time in Terminal. Open Docker Desktop first and wait until it
says it is running.

1. `cd ~/Desktop/grace-abounds-nz` then `git switch backend-phase-1`
2. Back up the existing environment file: `cp .env .env.backup`.
   Open `.env.example` (`open -e .env.example`) and copy any missing lines
   into `.env`: `API_INTERNAL_URL`, `API_ASSERTION_SECRET`,
   `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`.
   Do **not** copy `.env.example` over `.env`.
3. Run `openssl rand -base64 48` twice. Paste the first output after
   `AUTH_SECRET=` and the second after `API_ASSERTION_SECRET=` in `.env`
   (`open -e .env`), then save.
4. `docker compose up -d` (starts PostgreSQL)
5. `pnpm install` (a few minutes)
6. `pnpm --filter @grace-abounds/database migrate -- --name phase1_identity`
7. `pnpm --filter @grace-abounds/database seed` (test accounts, empty
   database only)
8. `pnpm typecheck` — send any errors to the agent
9. `pnpm dev` — keeps running; open http://localhost:3000/login. In
   development, sign-in codes print in this Terminal window. Ctrl+C stops it.

Real staff accounts:
`pnpm --filter @grace-abounds/database staff:add -- --email you@domain --role pastor --name "Full Name"`

## Google login setup (owner)

1. Sign in to Google Cloud Console with the church Gmail; create a project.
2. Configure the OAuth consent screen as **External** (basic email/profile
   sign-in does not need Google's review).
3. Credentials → Create OAuth client ID → Web application.
4. Authorised redirect URI: `http://localhost:3000/api/auth/callback/google`
   (add the production URL later).
5. Put the client ID and secret in `.env` as `AUTH_GOOGLE_ID` and
   `AUTH_GOOGLE_SECRET`.

## Known gaps after Phase 1

- Activities, messages, CMS and care data still come from browser storage
  until Phases 2–4.
- Profile pages for new accounts fall back to a demo profile until profiles
  move to the API.
- Auth.js passkey support is marked experimental.
