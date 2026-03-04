/*
  Warnings:

  - You are about to drop the column `inactiveTime` on the `TimeEntry` table. All the data in the column will be lost.
  - You are about to drop the column `paused` on the `TimeEntry` table. All the data in the column will be lost.
  - You are about to drop the column `pausedAt` on the `TimeEntry` table. All the data in the column will be lost.
  - You are about to drop the column `resumedAt` on the `TimeEntry` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TimeEntry" DROP COLUMN "inactiveTime",
DROP COLUMN "paused",
DROP COLUMN "pausedAt",
DROP COLUMN "resumedAt";

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityEvent_employeeId_createdAt_idx" ON "ActivityEvent"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
