-- CreateTable
CREATE TABLE "UserWorkSlot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,

    CONSTRAINT "UserWorkSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserWorkSlot_userId_idx" ON "UserWorkSlot"("userId");

-- AddForeignKey
ALTER TABLE "UserWorkSlot" ADD CONSTRAINT "UserWorkSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: default weekend = Friday (ISO 5)
ALTER TABLE "User" ADD COLUMN "weekendDays" INTEGER[] NOT NULL DEFAULT ARRAY[5]::INTEGER[];

-- Drop old weekly plan tables (replaced by User.weekendDays + UserWorkSlot)
DROP TABLE IF EXISTS "WeeklyWorkSlot";
DROP TABLE IF EXISTS "WeeklyWorkPlan";
