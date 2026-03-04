/*
  Warnings:

  - You are about to drop the column `pauseReason` on the `TimeEntry` table. All the data in the column will be lost.
  - You are about to drop the column `pausedAt` on the `TimeEntry` table. All the data in the column will be lost.
  - You are about to drop the column `resumedAt` on the `TimeEntry` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "parentTaskId" TEXT;

-- AlterTable
ALTER TABLE "TimeEntry" DROP COLUMN "pauseReason",
DROP COLUMN "pausedAt",
DROP COLUMN "resumedAt";

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
