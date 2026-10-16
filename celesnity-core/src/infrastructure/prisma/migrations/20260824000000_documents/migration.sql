-- Uploaded documents (currently PDFs only) and their raw-text extraction,
-- one JSON array entry per page. Global, like charts: no room/user scoping.
CREATE TABLE "celesnity_app"."documents" (
    "id" UUID NOT NULL,
    "filename" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "pages" JSONB NOT NULL DEFAULT '[]',
    "page_count" INTEGER NOT NULL,
    "extraction_status" VARCHAR(20) NOT NULL DEFAULT 'extracted',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "documents_created_at_idx" ON "celesnity_app"."documents"("created_at");
