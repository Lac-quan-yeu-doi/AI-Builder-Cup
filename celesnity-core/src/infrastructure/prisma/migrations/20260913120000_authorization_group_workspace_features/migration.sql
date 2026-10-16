ALTER TABLE "celesnity_app"."authorization_groups"
  ADD COLUMN "feature_visibility_configured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "visible_features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
