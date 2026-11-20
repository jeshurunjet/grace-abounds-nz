-- Phase 5C revised policy: documented records holds and due-only clean-up
-- runs. Additive only.
-- CreateEnum
CREATE TYPE "RetentionHoldReason" AS ENUM ('LEGAL_OBLIGATION', 'INVESTIGATION', 'CLAIM');

-- CreateEnum
CREATE TYPE "RetentionRunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "RetentionHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "RetentionHoldReason" NOT NULL,
    "reference" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "reviewBy" TIMESTAMP(3) NOT NULL,
    "placedById" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RetentionHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRun" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "RetentionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "result" JSONB,

    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetentionHold_userId_releasedAt_idx" ON "RetentionHold"("userId", "releasedAt");

-- CreateIndex
CREATE INDEX "RetentionHold_releasedAt_reviewBy_idx" ON "RetentionHold"("releasedAt", "reviewBy");

-- CreateIndex
CREATE INDEX "RetentionRun_status_leaseUntil_idx" ON "RetentionRun"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "RetentionRun_startedAt_idx" ON "RetentionRun"("startedAt");
