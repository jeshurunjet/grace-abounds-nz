-- Phase 3B: joining, per-date bookings and their history.
-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Participation" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL DEFAULT '',
    "status" "ParticipationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipationEvent" (
    "id" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Participation_activityId_dateKey_status_idx" ON "Participation"("activityId", "dateKey", "status");

-- CreateIndex
CREATE INDEX "Participation_userId_status_idx" ON "Participation"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Participation_activityId_dateKey_userId_key" ON "Participation"("activityId", "dateKey", "userId");

-- CreateIndex
CREATE INDEX "ParticipationEvent_participationId_idx" ON "ParticipationEvent"("participationId");

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationEvent" ADD CONSTRAINT "ParticipationEvent_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "Participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
