-- Phase 3C review: a sender's claim, separate from retry scheduling.
-- AlterTable
ALTER TABLE "CalendarSync" ADD COLUMN     "claimToken" TEXT,
ADD COLUMN     "claimedUntil" TIMESTAMP(3);
