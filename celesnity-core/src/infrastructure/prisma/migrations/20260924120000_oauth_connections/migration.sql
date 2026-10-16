-- CreateEnum
CREATE TYPE "celesnity_app"."OauthConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTH', 'REVOKED');

-- CreateTable
CREATE TABLE "celesnity_app"."oauth_connections" (
    "id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "external_account_id" VARCHAR(255) NOT NULL,
    "status" "celesnity_app"."OauthConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "encrypted_token_payload" TEXT NOT NULL,
    "encryption_iv" VARCHAR(255) NOT NULL,
    "encryption_auth_tag" VARCHAR(255) NOT NULL,
    "encryption_key_version" VARCHAR(50) NOT NULL,
    "token_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "provider_data" JSONB NOT NULL DEFAULT '{}',
    "connected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "oauth_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_connections_identity_id_provider_external_account_id_key"
    ON "celesnity_app"."oauth_connections"("identity_id", "provider", "external_account_id");

-- CreateIndex
CREATE INDEX "oauth_connections_identity_id_provider_idx"
    ON "celesnity_app"."oauth_connections"("identity_id", "provider");

-- AddForeignKey
ALTER TABLE "celesnity_app"."oauth_connections"
    ADD CONSTRAINT "oauth_connections_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "celesnity_app"."user_identities"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
