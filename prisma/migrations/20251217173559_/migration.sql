-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "inactiveTime" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "resumedAt" TIMESTAMP(3);
