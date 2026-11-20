-- Phase 5C: member account deletion records. Additive only.
-- CreateEnum
CREATE TYPE "AccountDeletionStage" AS ENUM ('ACCESS_REMOVED', 'PURGED');

-- CreateTable
CREATE TABLE "AccountDeletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestNote" TEXT NOT NULL DEFAULT '',
    "stage" "AccountDeletionStage" NOT NULL DEFAULT 'ACCESS_REMOVED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),
    "noticeEmail" TEXT,
    "noticeSentAt" TIMESTAMP(3),
    "noticeAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccountDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountDeletion_userId_key" ON "AccountDeletion"("userId");

-- CreateIndex
CREATE INDEX "AccountDeletion_stage_purgeAfter_idx" ON "AccountDeletion"("stage", "purgeAfter");

-- CreateIndex
CREATE INDEX "AccountDeletion_purgedAt_idx" ON "AccountDeletion"("purgedAt");
