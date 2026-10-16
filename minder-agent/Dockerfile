FROM node:22.19.0-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.build.json vitest.config.ts ./
COPY src src
COPY migrations migrations
COPY .agents/skills .agents/skills
RUN if [ -n "$(find .agents/skills -type l -print -quit)" ]; then \
      echo "Global skill folders must not contain symlinks" >&2; exit 1; \
    fi
# tsx resolves esbuild's native executable at runtime. Keep optional
# platform packages in the image so the same Dockerfile works on ARM64 and
# x86_64 builders instead of inheriting the host's npm omit configuration.
RUN npm ci --include=optional --ignore-scripts
RUN DATABASE_URL=postgresql://minder:minder@127.0.0.1:5433/minder_test \
  npx prisma generate --schema src/infrastructure/prisma/schema.prisma

COPY src/tests/compat src/tests/compat
COPY src/tests/phase-0 src/tests/phase-0

RUN npm run test:compat \
 && npm run test:phase-0 -- server.test.ts \
 && npm run check \
 && npm run build \
 && node --input-type=module -e 'import { loadRepositorySkills } from "./dist/infrastructure/skill/repository-skill-loader.js"; loadRepositorySkills(".agents/skills");'

FROM gcr.io/distroless/nodejs22-debian12:nonroot

WORKDIR /app
ENV NODE_ENV=production
ENV MINDER_SERVE_ADDR=0.0.0.0:8080
ENV MINDER_SANDBOX_SOCKET=/run/minder-sandbox/runner.sock
ENV MINDER_WORKSPACE_DIR=/tmp/minder-workspaces

COPY --from=build --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=build --chown=65532:65532 /app/dist ./dist
COPY --from=build --chown=65532:65532 /app/src ./src
COPY --from=build --chown=65532:65532 /app/migrations ./migrations
COPY --from=build --chown=65532:65532 /app/.agents/skills ./.agents/skills
COPY --from=build --chown=65532:65532 /app/tsconfig.json ./tsconfig.json

USER 65532:65532
EXPOSE 8080
CMD ["dist/bootstrap/http-main.js"]
