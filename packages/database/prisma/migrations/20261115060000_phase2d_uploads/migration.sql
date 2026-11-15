-- Phase 2D: verified uploads. Sermon recordings reach 5 GB, beyond INTEGER.
ALTER TABLE "Asset" ALTER COLUMN "size" SET DATA TYPE BIGINT;
ALTER TABLE "Asset" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'library',
ADD COLUMN "inline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "uploadId" TEXT,
ADD COLUMN "rejectReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN "verifiedAt" TIMESTAMP(3);
