# Architecture

Next.js provides the website and session/API gateway; Fastify owns business operations; Prisma/PostgreSQL stores application data; a separate worker handles asynchronous media work. Shared packages hold contracts, validation and infrastructure boundaries.

The [single project handover](../handoff/PROJECT-HANDOVER.md) records decisions, planned contracts, provider setup and verified implementation status. These boundaries are partly scaffolds until the corresponding phases pass review.
