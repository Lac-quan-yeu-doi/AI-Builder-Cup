CREATE TABLE "celesnity_app"."agent_automations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "event_topic" VARCHAR(255) NOT NULL,
    "agent_id" VARCHAR(255) NOT NULL,
    "input_template" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_automations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_automations_organization_id_name_key"
ON "celesnity_app"."agent_automations"("organization_id", "name");

CREATE INDEX "agent_automations_organization_id_event_topic_idx"
ON "celesnity_app"."agent_automations"("organization_id", "event_topic");

ALTER TABLE "celesnity_app"."agent_automations"
ADD CONSTRAINT "agent_automations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "celesnity_app"."agent_automation_triggers" (
    "id" UUID NOT NULL,
    "automation_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "delivery_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "session_key" VARCHAR(255),
    "error_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_automation_triggers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_automation_triggers_automation_id_created_at_idx"
ON "celesnity_app"."agent_automation_triggers"("automation_id", "created_at");

ALTER TABLE "celesnity_app"."agent_automation_triggers"
ADD CONSTRAINT "agent_automation_triggers_automation_id_fkey"
FOREIGN KEY ("automation_id") REFERENCES "celesnity_app"."agent_automations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
