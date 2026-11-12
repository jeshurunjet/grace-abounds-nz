-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResourceVisibility" AS ENUM ('PUBLIC', 'MEMBERS');

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NextStep" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "heading" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "ctaKind" TEXT NOT NULL DEFAULT 'interest',
    "ctaLabel" TEXT NOT NULL DEFAULT '',
    "ctaTarget" TEXT NOT NULL DEFAULT '',
    "path" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "NextStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ResourceFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'Document',
    "url" TEXT NOT NULL DEFAULT '',
    "assetId" TEXT,
    "folderId" TEXT,
    "visibility" "ResourceVisibility" NOT NULL DEFAULT 'MEMBERS',
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_key_key" ON "Location"("key");

-- CreateIndex
CREATE INDEX "Location_status_position_idx" ON "Location"("status", "position");

-- CreateIndex
CREATE INDEX "NextStep_status_position_idx" ON "NextStep"("status", "position");

-- CreateIndex
CREATE INDEX "TeamMember_status_position_idx" ON "TeamMember"("status", "position");

-- CreateIndex
CREATE INDEX "Resource_status_position_idx" ON "Resource"("status", "position");

-- AddForeignKey
ALTER TABLE "ResourceFolder" ADD CONSTRAINT "ResourceFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ResourceFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ResourceFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
