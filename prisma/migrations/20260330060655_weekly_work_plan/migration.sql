-- CreateTable
CREATE TABLE "WeeklyWorkPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekendDays" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyWorkPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyWorkSlot" (
    "id" TEXT NOT NULL,
    "weeklyWorkPlanId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,

    CONSTRAINT "WeeklyWorkSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyWorkPlan_weekStart_idx" ON "WeeklyWorkPlan"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyWorkPlan_userId_weekStart_key" ON "WeeklyWorkPlan"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "WeeklyWorkSlot_weeklyWorkPlanId_idx" ON "WeeklyWorkSlot"("weeklyWorkPlanId");

-- AddForeignKey
ALTER TABLE "WeeklyWorkPlan" ADD CONSTRAINT "WeeklyWorkPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyWorkSlot" ADD CONSTRAINT "WeeklyWorkSlot_weeklyWorkPlanId_fkey" FOREIGN KEY ("weeklyWorkPlanId") REFERENCES "WeeklyWorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
