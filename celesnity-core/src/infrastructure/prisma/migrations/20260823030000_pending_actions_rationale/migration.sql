-- Why a caller proposed a pending action, surfaced to the human reviewer
-- (AIP's "agent decision log"). Nullable: not every proposer supplies one.
ALTER TABLE "celesnity_app"."pending_actions"
  ADD COLUMN "rationale" TEXT;
