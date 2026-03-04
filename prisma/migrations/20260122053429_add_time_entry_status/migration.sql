-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('STARTED', 'PAUSED', 'RESUMED', 'STOPPED');

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "status" "TimeEntryStatus" NOT NULL DEFAULT 'STARTED';

-- CreateIndex
CREATE INDEX "TimeEntry_status_idx" ON "TimeEntry"("status");
