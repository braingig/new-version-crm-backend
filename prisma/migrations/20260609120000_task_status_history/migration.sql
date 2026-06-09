-- CreateTable
CREATE TABLE "TaskStatusHistory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TaskStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskStatusHistory_taskId_idx" ON "TaskStatusHistory"("taskId");

-- CreateIndex
CREATE INDEX "TaskStatusHistory_startedAt_idx" ON "TaskStatusHistory"("startedAt");

-- CreateIndex
CREATE INDEX "TaskStatusHistory_endedAt_idx" ON "TaskStatusHistory"("endedAt");

-- AddForeignKey
ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one open history row per existing task
INSERT INTO "TaskStatusHistory" ("id", "taskId", "status", "startedAt", "endedAt")
SELECT
    'hist-init-' || t."id",
    t."id",
    t."status",
    CASE
        WHEN t."status" = 'TODO' THEN t."createdAt"
        ELSE t."updatedAt"
    END,
    NULL
FROM "Task" t;
