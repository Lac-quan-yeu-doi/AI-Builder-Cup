-- Durable audit trail for auditRequired:true actions (see chart.actions.ts).
-- Previously the sole audit implementation only logged to stdout, so a bad
-- write had no queryable record of who did it or what it changed.
CREATE TABLE "celesnity_app"."audit_log_entries" (
    "id" UUID NOT NULL,
    "action_name" VARCHAR(100) NOT NULL,
    "actor" JSONB NOT NULL,
    "input" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_entries_action_name_created_at_idx" ON "celesnity_app"."audit_log_entries"("action_name", "created_at");
