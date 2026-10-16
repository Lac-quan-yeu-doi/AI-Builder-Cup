CREATE TABLE "celesnity_app"."pending_actions" (
    "id" UUID NOT NULL,
    "action_name" VARCHAR(100) NOT NULL,
    "input" JSONB NOT NULL,
    "actor" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "pending_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pending_actions_status_created_at_idx" ON "celesnity_app"."pending_actions" ("status", "created_at");
