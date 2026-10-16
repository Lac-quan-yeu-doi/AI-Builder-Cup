# syntax=docker/dockerfile:1

# Static Docker CLI, copied into the runtime image. The execution worker uses it
# to `docker cp` the script into the Spark container and `docker exec` spark-submit.
FROM docker:27-cli AS dockercli

# --- Build: install all deps, generate the Prisma client, compile to dist ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
# The schema and its migrations live under src/infrastructure/prisma, so copying
# src is enough for both `prisma generate` and `prisma migrate deploy`.
COPY src ./src
RUN npx prisma generate && npm run build

# --- Production dependencies only ---
FROM node:22-bookworm-slim AS proddeps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Migrator: the Prisma CLI plus the schema, for `prisma migrate deploy` ---
#
# A separate target rather than part of the runtime image below. `prisma` is a
# devDependency, so the runtime image's `npm ci --omit=dev` tree does not contain
# the CLI; adding it there would ship a migration tool inside the serving process
# for the sake of a command that runs once per rollout.
#
# Migrations cannot run from CI either: Cloud SQL is reachable on its private IP
# only, so `migrate deploy` has to execute inside the VPC. This image is what the
# version-pinned migration/bootstrap and readiness Jobs use before API
# and worker rollout. No serving pod runs an initContainer migration.
#
# node_modules comes from the build stage, which installed the full tree, so the
# CLI and its TypeScript loader for prisma.config.ts are both present.
FROM node:22-bookworm-slim AS migrator
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src/infrastructure/prisma ./src/infrastructure/prisma
COPY --from=build /app/dist ./dist
# Invoke the bundled CLI directly so the Job never invokes npm or reaches a
# registry from the private node pool.
CMD ["/app/node_modules/.bin/prisma", "migrate", "deploy"]

# --- Runtime ---
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY package.json package-lock.json ./
COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Migrations are applied from the image at deploy time, so the schema directory
# ships with it. Only the Prisma inputs are copied, not the TypeScript sources.
COPY --from=build /app/src/infrastructure/prisma/schema.prisma ./src/infrastructure/prisma/schema.prisma
COPY --from=build /app/src/infrastructure/prisma/migrations ./src/infrastructure/prisma/migrations
COPY prisma.config.ts ./
# AGENT_ACTIONS_POLICY_PATH (config/agent-actions.yaml by default) is read at
# boot relative to this WORKDIR by ActionsModule — without this, the API
# process fails to start in every deployed environment. Shipped in this
# shared image even though only the API process reads it; the worker
# command overrides CMD but uses the same image.
COPY config ./config
# Default command is the API; the worker service overrides it in compose.
CMD ["node", "dist/bootstrap/api-main.js"]
