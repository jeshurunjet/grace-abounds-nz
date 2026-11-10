# API documentation

The [single project handover](../handoff/PROJECT-HANDOVER.md) contains the backend decisions, permission matrix, proposed contracts, phase gates and current implementation status. Update that file rather than creating a second API plan.

On main, only `GET /health` is implemented. The separate Phase 1 branch is an unverified draft; inspect the handover and current source before assuming an endpoint works. Frontend types are in `apps/web/app/lib/content.ts`, `page-content.ts` and `activities.ts`.
