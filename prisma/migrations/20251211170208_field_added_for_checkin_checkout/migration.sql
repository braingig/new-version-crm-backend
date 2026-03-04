/*
  Warnings:

  - You are about to drop the column `documentation` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `fileName` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `filePath` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `fileSize` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `fileType` on the `Project` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[employeeId,date,sessionNumber]` on the table `Timesheet` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('REMOTE', 'ONSITE');

-- DropIndex
DROP INDEX "Timesheet_employeeId_date_key";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "documentation",
DROP COLUMN "fileName",
DROP COLUMN "filePath",
DROP COLUMN "fileSize",
DROP COLUMN "fileType";

-- AlterTable
ALTER TABLE "Timesheet" ADD COLUMN     "sessionNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "workType" "WorkType" NOT NULL DEFAULT 'REMOTE';

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_employeeId_date_sessionNumber_key" ON "Timesheet"("employeeId", "date", "sessionNumber");
