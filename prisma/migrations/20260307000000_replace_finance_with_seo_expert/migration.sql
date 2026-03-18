-- Add new enum value for SEO Expert
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SEO_EXPERT';

-- Migrate any existing FINANCE users to SALES before removing FINANCE
UPDATE "User" SET role = 'SALES' WHERE role = 'FINANCE';

-- Replace enum: create new type without FINANCE, swap column, drop old type
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'HR', 'TEAM_LEAD', 'DEVELOPER', 'SALES', 'SEO_EXPERT');

ALTER TABLE "User" ADD COLUMN "role_new" "UserRole_new";

UPDATE "User" SET "role_new" = role::text::"UserRole_new";

ALTER TABLE "User" DROP COLUMN "role";

ALTER TABLE "User" RENAME COLUMN "role_new" TO "role";

DROP TYPE "UserRole";

ALTER TYPE "UserRole_new" RENAME TO "UserRole";

ALTER TABLE "User" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'DEVELOPER'::"UserRole";
