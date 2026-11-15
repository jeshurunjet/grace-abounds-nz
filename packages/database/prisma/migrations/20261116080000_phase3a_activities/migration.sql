-- Phase 3A: activities and per-date exceptions (local NZ dates and times).
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "leader" TEXT NOT NULL DEFAULT '',
    "tag" TEXT NOT NULL DEFAULT '',
    "locationKey" TEXT NOT NULL DEFAULT '',
    "venue" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "repeat" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "untilDate" DATE,
    "days" INTEGER[],
    "monthWeek" INTEGER NOT NULL DEFAULT 1,
    "monthDay" INTEGER NOT NULL DEFAULT 0,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "joinMode" TEXT NOT NULL DEFAULT 'none',
    "capacity" INTEGER,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityException" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "venue" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Activity_slug_key" ON "Activity"("slug");
CREATE INDEX "Activity_status_idx" ON "Activity"("status");
CREATE UNIQUE INDEX "ActivityException_activityId_date_key" ON "ActivityException"("activityId", "date");

ALTER TABLE "ActivityException" ADD CONSTRAINT "ActivityException_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
