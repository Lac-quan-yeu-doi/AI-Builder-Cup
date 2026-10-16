CREATE TYPE "celesnity_app"."TutorialProgressStatus" AS ENUM
  ('NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED');

CREATE TYPE "celesnity_app"."TutorialOnboardingDecisionValue" AS ENUM
  ('ACCEPTED', 'DISMISSED');

CREATE TABLE "celesnity_app"."tutorial_definitions" (
  "id" VARCHAR(120) NOT NULL,
  "metadata" JSONB NOT NULL,
  "steps" JSONB NOT NULL,
  "required_features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "prerequisites" JSONB NOT NULL,
  "context_requirements" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tutorial_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "celesnity_app"."tutorial_progress" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "identity_id" UUID NOT NULL,
  "tutorial_id" VARCHAR(120) NOT NULL,
  "status" "celesnity_app"."TutorialProgressStatus" NOT NULL,
  "current_step_id" VARCHAR(120) NOT NULL,
  "completed_step_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "context_selections" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutorial_progress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tutorial_progress_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tutorial_progress_identity_id_fkey" FOREIGN KEY ("identity_id")
    REFERENCES "celesnity_app"."user_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tutorial_progress_tutorial_id_fkey" FOREIGN KEY ("tutorial_id")
    REFERENCES "celesnity_app"."tutorial_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tutorial_progress_organization_id_identity_id_tutorial_id_key"
  ON "celesnity_app"."tutorial_progress" ("organization_id", "identity_id", "tutorial_id");
CREATE INDEX "tutorial_progress_organization_id_identity_id_status_idx"
  ON "celesnity_app"."tutorial_progress" ("organization_id", "identity_id", "status");
CREATE UNIQUE INDEX "tutorial_progress_one_active_run_key"
  ON "celesnity_app"."tutorial_progress" ("organization_id", "identity_id")
  WHERE "status" = 'IN_PROGRESS';

CREATE TABLE "celesnity_app"."tutorial_onboarding_decisions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "identity_id" UUID NOT NULL,
  "decision" "celesnity_app"."TutorialOnboardingDecisionValue" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tutorial_onboarding_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tutorial_onboarding_decisions_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tutorial_onboarding_decisions_identity_id_fkey" FOREIGN KEY ("identity_id")
    REFERENCES "celesnity_app"."user_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tutorial_onboarding_decisions_organization_id_identity_id_key"
  ON "celesnity_app"."tutorial_onboarding_decisions" ("organization_id", "identity_id");

CREATE TABLE "celesnity_app"."tutorial_completions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "identity_id" UUID NOT NULL,
  "run_id" VARCHAR(160) NOT NULL,
  "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tutorial_completions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tutorial_completions_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tutorial_completions_identity_id_fkey" FOREIGN KEY ("identity_id")
    REFERENCES "celesnity_app"."user_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tutorial_completions_organization_id_identity_id_run_id_key"
  ON "celesnity_app"."tutorial_completions" ("organization_id", "identity_id", "run_id");
CREATE INDEX "tutorial_completions_organization_id_identity_id_completed_at_idx"
  ON "celesnity_app"."tutorial_completions" ("organization_id", "identity_id", "completed_at");

INSERT INTO "celesnity_app"."tutorial_definitions" (
  "id", "metadata", "steps", "required_features", "prerequisites",
  "context_requirements", "updated_at"
) VALUES
(
  'tutorial-connections-basics',
  '{"title":"Verify a database source and read its tables","summary":"Test an authorized database source and find the tables it exposes.","category":"Getting started","learningOutcomes":["Open the database container from the workspace rail","Verify an existing database source","Locate the tables a connected source publishes"],"estimatedMinutes":7,"stepCount":3}'::jsonb,
  '[{"id":"connections-step-open-databases","order":1,"title":"Open Databases","instructionalContent":"Databases is the container for everything a source publishes. Open it from the workspace rail; this guide follows you there.","destinationFeature":"CATALOG_DATABASES","destinationHref":"/catalog/databases","targetControl":{"id":"nav-databases","accessibleName":"Databases","selector":"a[href=\"/catalog/databases\"]"}},{"id":"connections-step-verify","order":2,"title":"Verify the connection","instructionalContent":"Test the selected database source. A source that fails verification cannot be read by a pipeline.","destinationFeature":"CATALOG_DATABASES","destinationHref":"/catalog/databases","requiredAction":{"id":"test-database-connection","accessibleName":"Test connection"}},{"id":"connections-step-browse-tables","order":3,"title":"Browse the tables","instructionalContent":"Open Tables to confirm the source is readable, and check a column list against what you expected.","destinationFeature":"CATALOG_TABLES","destinationHref":"/catalog/tables"}]'::jsonb,
  ARRAY['CATALOG_DATABASES','CATALOG_TABLES'],
  '[]'::jsonb,
  '[{"id":"connections-context-database-service","resourceType":"DATABASE_SERVICE","selectionCount":1}]'::jsonb,
  CURRENT_TIMESTAMP
),
(
  'tutorial-query-first-result',
  '{"title":"Run your first SQL query","summary":"Run a statement in the query workspace and read the status, timing, and columns.","category":"Querying data","learningOutcomes":["Run SQL against a catalog namespace","Read a query result status and its statistics"],"estimatedMinutes":5,"stepCount":1}'::jsonb,
  '[{"id":"query-step-run","order":1,"title":"Run a statement","instructionalContent":"Open Query, enter a SELECT against a catalog namespace, and run it. The result panel reports the status, the elapsed time, and the returned columns.","destinationFeature":"QUERY","destinationHref":"/sql","requiredAction":{"id":"run-query","accessibleName":"Run query"},"targetControl":{"id":"nav-query","accessibleName":"Query","selector":"a[href=\"/sql\"]"}}]'::jsonb,
  ARRAY['QUERY'],
  '[]'::jsonb,
  '[]'::jsonb,
  CURRENT_TIMESTAMP
);
