-- CreateTable
CREATE TABLE "celesnity_app"."charts" (
    "id" UUID NOT NULL,
    "room_id" VARCHAR(255) NOT NULL,
    "run_id" VARCHAR(255),
    "title" VARCHAR(500) NOT NULL,
    "chart_type" VARCHAR(30) NOT NULL,
    "encodings" JSONB NOT NULL DEFAULT '{}',
    "data" JSONB NOT NULL DEFAULT '[]',
    "vl_spec" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "error_message" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "charts_room_id_updated_at_idx" ON "celesnity_app"."charts"("room_id", "updated_at");
