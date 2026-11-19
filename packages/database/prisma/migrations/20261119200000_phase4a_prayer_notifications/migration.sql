-- Phase 4A: private prayer requests (with Pastor notes and member-visible
-- history) and durable in-app notifications.
-- CreateEnum
CREATE TYPE "PrayerStatus" AS ENUM ('SUBMITTED', 'PRAYING', 'PRAYED_FOR');

-- CreateTable
CREATE TABLE "PrayerRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "PrayerStatus" NOT NULL DEFAULT 'SUBMITTED',
    "clientKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "PrayerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerNote" (
    "id" TEXT NOT NULL,
    "prayerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrayerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerEvent" (
    "id" TEXT NOT NULL,
    "prayerId" TEXT NOT NULL,
    "status" "PrayerStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrayerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "href" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrayerRequest_status_createdAt_idx" ON "PrayerRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PrayerRequest_closedAt_idx" ON "PrayerRequest"("closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerRequest_userId_clientKey_key" ON "PrayerRequest"("userId", "clientKey");

-- CreateIndex
CREATE INDEX "PrayerNote_prayerId_idx" ON "PrayerNote"("prayerId");

-- CreateIndex
CREATE INDEX "PrayerEvent_prayerId_idx" ON "PrayerEvent"("prayerId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "PrayerRequest" ADD CONSTRAINT "PrayerRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerNote" ADD CONSTRAINT "PrayerNote_prayerId_fkey" FOREIGN KEY ("prayerId") REFERENCES "PrayerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerEvent" ADD CONSTRAINT "PrayerEvent_prayerId_fkey" FOREIGN KEY ("prayerId") REFERENCES "PrayerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
