-- Phase 5C corrections: canonical audit subjects (so records holds cover
-- staff entries about a held person's care records, also after those
-- records are gone) and durable, fenced, resumable clean-up runs.
-- Additive only: new nullable/defaulted columns, a new enum, new indexes,
-- and a backfill of the new subject column from existing rows.

-- CreateEnum
CREATE TYPE "RetentionRunStage" AS ENUM ('ACCOUNTS', 'AUDIT', 'DELETIONS', 'FINISHED');

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN "subjectId" TEXT;

-- AlterTable
ALTER TABLE "RetentionRun" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "claimToken" TEXT,
ADD COLUMN "failure" TEXT,
ADD COLUMN "removedAccounts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "removedAuditEvents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "removedDeletionRecords" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "requestKey" TEXT,
ADD COLUMN "stage" "RetentionRunStage" NOT NULL DEFAULT 'ACCOUNTS';

-- CreateIndex
CREATE INDEX "AuditEvent_subjectId_idx" ON "AuditEvent"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionRun_requestedById_requestKey_key" ON "RetentionRun"("requestedById", "requestKey");

-- Backfill: the person each existing entry is about, where it can still
-- be known (the same rules recordAudit applies to new entries).
UPDATE "AuditEvent" SET "subjectId" = "entityId"
WHERE "entityType" IN ('User', 'user');

UPDATE "AuditEvent" AS a SET "subjectId" = p."userId"
FROM "PrayerRequest" AS p
WHERE a."entityType" = 'prayer' AND a."entityId" = p."id";

UPDATE "AuditEvent" AS a SET "subjectId" = p."userId"
FROM "Appointment" AS p
WHERE a."entityType" = 'appointment' AND a."entityId" = p."id";

UPDATE "AuditEvent" AS a SET "subjectId" = p."userId"
FROM "Participation" AS p
WHERE a."entityType" = 'participation' AND a."entityId" = p."id";

UPDATE "AuditEvent" AS a SET "subjectId" = p."userId"
FROM "DataExport" AS p
WHERE a."entityType" = 'DataExport' AND a."entityId" = p."id";

UPDATE "AuditEvent" AS a SET "subjectId" = p."userId"
FROM "UserSession" AS p
WHERE a."entityType" = 'UserSession' AND a."entityId" = p."id";
