UPDATE "celesnity_app"."organization_memberships"
SET "status" = 'REVOKED'
WHERE "status" = 'SUSPENDED';

ALTER TABLE "celesnity_app"."organization_memberships"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "celesnity_app"."MembershipStatus"
  RENAME TO "MembershipStatus_old";

CREATE TYPE "celesnity_app"."MembershipStatus" AS ENUM ('ACTIVE', 'REVOKED');

ALTER TABLE "celesnity_app"."organization_memberships"
  ALTER COLUMN "status" TYPE "celesnity_app"."MembershipStatus"
  USING ("status"::text::"celesnity_app"."MembershipStatus");

ALTER TABLE "celesnity_app"."organization_memberships"
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

DROP TYPE "celesnity_app"."MembershipStatus_old";
