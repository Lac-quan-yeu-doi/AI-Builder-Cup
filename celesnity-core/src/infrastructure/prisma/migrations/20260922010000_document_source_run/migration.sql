ALTER TABLE "celesnity_app"."documents"
ADD COLUMN "source_run_id" UUID;

CREATE INDEX "documents_source_run_id_idx"
ON "celesnity_app"."documents"("source_run_id");
