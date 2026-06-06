-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleConnectedAt" TIMESTAMP(3),
ADD COLUMN     "googleEmail" TEXT,
ADD COLUMN     "googleRefreshToken" TEXT;
