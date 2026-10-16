-- CreateTable
CREATE TABLE "celesnity_app"."message_blocks" (
    "id" UUID NOT NULL,
    "room_id" VARCHAR(255) NOT NULL,
    "run_id" VARCHAR(255),
    "block_type" VARCHAR(30) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "fallback_text" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_blocks_room_id_published_at_idx" ON "celesnity_app"."message_blocks"("room_id", "published_at");
