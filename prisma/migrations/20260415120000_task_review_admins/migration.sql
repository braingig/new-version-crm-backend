-- CreateTable
CREATE TABLE "TaskReviewAdmin" (
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskReviewAdmin_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "TaskReviewAdmin" ADD CONSTRAINT "TaskReviewAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
