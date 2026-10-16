FROM node:22.21.1-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
ENV NEXT_TELEMETRY_DISABLED=1

# The API base URL is baked in at build time, not read at runtime.
#
# Next.js inlines every NEXT_PUBLIC_* variable into the client bundle during
# `next build`, because the browser has no access to the server's environment. A
# value supplied to the container instead of to the build is simply ignored, and the
# app silently falls back to the localhost default in
# src/platform/configuration/public-environment.ts — which fails in the browser with
# a connection error rather than anything that points at configuration.
#
# The consequence is that one image is not portable across environments: a build for
# dev.celesnity.com cannot be promoted to another hostname without rebuilding. That
# is a Next.js constraint rather than a choice here.
#
# The default keeps `docker build` with no arguments working for local use.
ARG NEXT_PUBLIC_AGENT_API_URL=/api/agent
ENV NEXT_PUBLIC_AGENT_API_URL=$NEXT_PUBLIC_AGENT_API_URL

ARG NEXT_PUBLIC_CHAT_AGENT_NAME=chat-assistant
ENV NEXT_PUBLIC_CHAT_AGENT_NAME=$NEXT_PUBLIC_CHAT_AGENT_NAME

ARG NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME=automation-workflow-editor
ENV NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME=$NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME

ARG NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME=skill-creator
ENV NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME=$NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME

ARG NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME=plant-model-assistant
ENV NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME=$NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME

COPY . .
RUN npm run build

FROM node:22.21.1-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Bind to every interface.
#
# The standalone server reads `process.env.HOSTNAME || '0.0.0.0'`, and a container
# runtime sets HOSTNAME to the container's own name — the pod name under Kubernetes.
# Without this the server tries to bind to a name that does not resolve and the
# process exits, which reads as a crash-looping image rather than as a binding
# problem. Set here as well as in the Deployment so the image behaves the same way
# under plain `docker run`.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
