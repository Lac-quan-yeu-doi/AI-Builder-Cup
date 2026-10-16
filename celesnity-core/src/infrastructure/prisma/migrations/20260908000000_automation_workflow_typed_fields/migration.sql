-- The typed-trigger-fields feature added `triggerFields` to AutomationWorkflow
-- and `systemPrompt` to AutomationWorkflowStep in schema.prisma (and the
-- generated Prisma client) without an accompanying migration. Databases
-- provisioned via `prisma db push` (e.g. local dev) already have these
-- columns, but environments applied strictly through `prisma migrate deploy`
-- (e.g. the deployed development database) never received them — so
-- `prisma.automationWorkflow.findMany()` failed with
-- "The column automation_workflows.trigger_fields does not exist".
--
-- IF NOT EXISTS makes this migration safe to apply on databases that already
-- have the columns (from db push) as well as those that are missing them.

ALTER TABLE "celesnity_app"."automation_workflows"
ADD COLUMN IF NOT EXISTS "trigger_fields" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "celesnity_app"."automation_workflow_steps"
ADD COLUMN IF NOT EXISTS "system_prompt" TEXT;
