-- Phase 5B correction: track every data export file before upload, so
-- surplus, failed, crashed and expired attempts are always cleaned up.
-- Additive only.
-- CreateTable
CREATE TABLE "DataExportFile" (
    "key" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "DataExportFile_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "DataExportFile_exportId_idx" ON "DataExportFile"("exportId");

-- CreateIndex
CREATE INDEX "DataExportFile_removedAt_idx" ON "DataExportFile"("removedAt");
