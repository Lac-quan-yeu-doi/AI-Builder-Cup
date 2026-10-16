CREATE TABLE "celesnity_app"."agent_run_scopes" (
  "run_id" UUID NOT NULL PRIMARY KEY,
  "room_id" VARCHAR(255) NOT NULL,
  "organization_id" UUID NOT NULL,
  "bound_by_id" UUID NOT NULL,
  "agent_name" VARCHAR(120) NOT NULL,
  "catalog" VARCHAR(255),
  "schema" VARCHAR(255),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "agent_run_scopes_scope_pair_check" CHECK (
    ("catalog" IS NULL AND "schema" IS NULL) OR
    ("catalog" IS NOT NULL AND "schema" IS NOT NULL)
  ),
  CONSTRAINT "agent_run_scopes_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE
);
CREATE INDEX "agent_run_scopes_room_id_organization_id_idx"
  ON "celesnity_app"."agent_run_scopes"("room_id", "organization_id");
CREATE INDEX "agent_run_scopes_expires_at_idx"
  ON "celesnity_app"."agent_run_scopes"("expires_at");
-- A room may have only one active authorization scope. A new turn closes the
-- prior scope atomically; a concurrent registration conflicts and fails shut.
CREATE UNIQUE INDEX "agent_run_scopes_one_open_per_room_idx"
  ON "celesnity_app"."agent_run_scopes"("room_id")
  WHERE "closed_at" IS NULL;
