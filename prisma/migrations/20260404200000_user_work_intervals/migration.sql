-- Replace per-day slots with day-agnostic intervals (same hours every working day).

DROP TABLE IF EXISTS "UserWorkSlot";

CREATE TABLE "UserWorkInterval" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,

    CONSTRAINT "UserWorkInterval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserWorkInterval_userId_idx" ON "UserWorkInterval"("userId");

ALTER TABLE "UserWorkInterval" ADD CONSTRAINT "UserWorkInterval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
