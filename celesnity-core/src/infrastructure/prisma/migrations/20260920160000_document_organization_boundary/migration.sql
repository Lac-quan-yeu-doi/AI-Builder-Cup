-- Never guess ownership of existing global documents. NULL rows are quarantined
-- by the repository until an operator applies a verified ownership mapping.
ALTER TABLE "celesnity_app"."documents" ADD COLUMN "organization_id" UUID;
ALTER TABLE "celesnity_app"."documents" ADD CONSTRAINT "documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "documents_organization_id_created_at_idx"
  ON "celesnity_app"."documents"("organization_id", "created_at");
