CREATE TABLE "celesnity_app"."dashboards" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "current_revision" INTEGER NOT NULL DEFAULT 1,
    "created_by_identity_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "celesnity_app"."dashboard_tabs" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "dashboard_tabs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "celesnity_app"."dashboard_cards" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "tab_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "chart_id" UUID,
    "chart_revision_number" INTEGER,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "content" JSONB,
    "visualization_overrides" JSONB,
    CONSTRAINT "dashboard_cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "celesnity_app"."dashboard_filters" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "semantic_type" VARCHAR(40) NOT NULL,
    "operator" VARCHAR(40) NOT NULL,
    "default_value" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "values_source" JSONB,
    "placement_kind" VARCHAR(30) NOT NULL,
    "placement_card_id" UUID,
    "order" INTEGER NOT NULL,
    CONSTRAINT "dashboard_filters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "celesnity_app"."dashboard_filter_mappings" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "filter_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "target_kind" VARCHAR(40) NOT NULL,
    "target" JSONB NOT NULL,
    CONSTRAINT "dashboard_filter_mappings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dashboards_organization_id_collection_id_archived_at_updated_at_idx"
ON "celesnity_app"."dashboards"("organization_id", "collection_id", "archived_at", "updated_at");
CREATE UNIQUE INDEX "dashboard_tabs_dashboard_id_order_key"
ON "celesnity_app"."dashboard_tabs"("dashboard_id", "order");
CREATE INDEX "dashboard_tabs_dashboard_id_order_idx"
ON "celesnity_app"."dashboard_tabs"("dashboard_id", "order");
CREATE INDEX "dashboard_cards_tab_id_y_x_idx"
ON "celesnity_app"."dashboard_cards"("tab_id", "y", "x");
CREATE INDEX "dashboard_cards_dashboard_id_idx"
ON "celesnity_app"."dashboard_cards"("dashboard_id");
CREATE INDEX "dashboard_cards_chart_id_idx"
ON "celesnity_app"."dashboard_cards"("chart_id");
CREATE UNIQUE INDEX "dashboard_filters_dashboard_id_slug_key"
ON "celesnity_app"."dashboard_filters"("dashboard_id", "slug");
CREATE INDEX "dashboard_filters_dashboard_id_order_idx"
ON "celesnity_app"."dashboard_filters"("dashboard_id", "order");
CREATE INDEX "dashboard_filters_placement_card_id_idx"
ON "celesnity_app"."dashboard_filters"("placement_card_id");
CREATE UNIQUE INDEX "dashboard_filter_mappings_filter_id_card_id_key"
ON "celesnity_app"."dashboard_filter_mappings"("filter_id", "card_id");
CREATE INDEX "dashboard_filter_mappings_dashboard_id_idx"
ON "celesnity_app"."dashboard_filter_mappings"("dashboard_id");
CREATE INDEX "dashboard_filter_mappings_card_id_idx"
ON "celesnity_app"."dashboard_filter_mappings"("card_id");

ALTER TABLE "celesnity_app"."dashboards"
ADD CONSTRAINT "dashboards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboards"
ADD CONSTRAINT "dashboards_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "celesnity_app"."chart_collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboards"
ADD CONSTRAINT "dashboards_created_by_identity_id_fkey" FOREIGN KEY ("created_by_identity_id") REFERENCES "celesnity_app"."user_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboard_tabs"
ADD CONSTRAINT "dashboard_tabs_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "celesnity_app"."dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboard_cards"
ADD CONSTRAINT "dashboard_cards_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "celesnity_app"."dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboard_cards"
ADD CONSTRAINT "dashboard_cards_tab_id_fkey" FOREIGN KEY ("tab_id") REFERENCES "celesnity_app"."dashboard_tabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboard_cards"
ADD CONSTRAINT "dashboard_cards_chart_id_fkey" FOREIGN KEY ("chart_id") REFERENCES "celesnity_app"."charts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboard_filters"
ADD CONSTRAINT "dashboard_filters_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "celesnity_app"."dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboard_filters"
ADD CONSTRAINT "dashboard_filters_placement_card_id_fkey" FOREIGN KEY ("placement_card_id") REFERENCES "celesnity_app"."dashboard_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboard_filter_mappings"
ADD CONSTRAINT "dashboard_filter_mappings_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "celesnity_app"."dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboard_filter_mappings"
ADD CONSTRAINT "dashboard_filter_mappings_filter_id_fkey" FOREIGN KEY ("filter_id") REFERENCES "celesnity_app"."dashboard_filters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."dashboard_filter_mappings"
ADD CONSTRAINT "dashboard_filter_mappings_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "celesnity_app"."dashboard_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
