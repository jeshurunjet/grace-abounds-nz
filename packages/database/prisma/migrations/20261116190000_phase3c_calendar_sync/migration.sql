-- Phase 3C: one-way public Google Calendar delivery state per activity.
-- CreateTable
CREATE TABLE "CalendarSync" (
    "activityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "wanted" INTEGER NOT NULL DEFAULT 0,
    "synced" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT NOT NULL DEFAULT '',
    "syncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSync_pkey" PRIMARY KEY ("activityId")
);

-- CreateIndex
CREATE INDEX "CalendarSync_status_nextAttemptAt_idx" ON "CalendarSync"("status", "nextAttemptAt");
