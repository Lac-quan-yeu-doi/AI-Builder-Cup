# Shared Workspace Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let minder-agent run Bash and Python snippets against the active room workspace through one per-Pod sandbox runner.

**Architecture:** Keep the Distroless API container and add a Debian runner sidecar. The API sends commands and its trusted active workspace context over a private Unix socket; the runner validates the workspace beneath the shared cache and applies a per-command Bubblewrap policy using one initialized SandboxManager.

**Tech Stack:** Node.js 22, Unix domain sockets, `@anthropic-ai/sandbox-runtime` (pinned), Bubblewrap, Bash, Python 3, Kubernetes sidecar.

**Spec:** `docs/superpowers/specs/2026-09-23-shared-workspace-sandbox-design.md`

## Global Constraints

- The agent service remains Distroless; Bash, Python, Bubblewrap, and the sandbox runtime live in the runner image.
- Only the runner and minder containers mount the private socket and shared workspace cache.
- The runner gets no Minder application secrets or external service configuration.
- Each command can read and write only its active workspace within the cache, plus invocation scratch space.
- Sandbox network access is denied; sandbox startup or wrapping failure never falls back to host execution.
- Workspace files are writable to executed commands; sensitive files remain denied.
- Do not add a Kubernetes Job per command, a public execution API, or a database table for sandbox state.

---

## File Map

- `src/infrastructure/tools/core/bash.ts`: validate command and workspace path, then delegate the command and trusted workspace context to the local runner.
- `src/infrastructure/tools/core/sandbox-runner-client.ts`: newline-delimited JSON over a Unix socket with cancellation and response bounds.
- `sandbox-runner/server.mjs`: validate each request, initialize SandboxManager once, apply per-command read/write/network policy, execute, and bound output.
- `sandbox-runner/package.json`, `sandbox-runner/package-lock.json`, `sandbox-runner/Dockerfile`: isolated runtime dependencies and image.
- `k8s/base/deployment.yaml`: shared cache/socket volumes, runner sidecar, and socket readiness wiring.
- `Dockerfile`: configure the API tool to use the local socket without adding shell or Python to the API image.

## Task 1: Build the runner image and socket server

**Files:**

- Create: `sandbox-runner/package.json`
- Create: `sandbox-runner/package-lock.json`
- Create: `sandbox-runner/Dockerfile`
- Create: `sandbox-runner/server.mjs`

- [x] Pin `@anthropic-ai/sandbox-runtime` to an exact release whose Linux `wrapWithSandbox` supports per-command filesystem overrides; include no application dependencies.
- [x] Initialize one `SandboxManager` at runner startup with network disabled and fail startup if Linux, Bubblewrap, seccomp, or required support tools are unavailable.
- [x] Listen on the configured Unix socket, create its parent directory, and set socket permissions so UID/GID 65532 peers can connect without making it public.
- [x] Accept one JSON request per socket connection with command, relative workspace path, and working directory; reject malformed/oversized requests.
- [x] Resolve the workspace under the configured workspace-cache root, reject traversal/symlink escapes, and verify the working directory remains under that workspace.
- [x] Wrap each command with `denyRead` for the workspace cache plus `allowRead` for only the active room workspace, deny credential-file patterns, `allowWrite` for a fresh invocation scratch directory, and an empty network allowlist.
- [x] Spawn `/bin/bash` in the Bubblewrap wrapper with a minimal environment; cap combined stdout/stderr, kill the command on client disconnect, remove scratch data, and return exit status.
- [x] Fail closed on any validation, sandbox wrapping, or process-start error; never call the raw command directly.

## Task 2: Route the existing Bash tool through the runner

**Files:**

- Create: `src/infrastructure/tools/core/sandbox-runner-client.ts`
- Modify: `src/infrastructure/tools/core/bash.ts`
- Modify: `Dockerfile`

- [x] Replace the simple-command parser and executable allowlist in `BashTool` with a request to the local runner; retain command-required, path confinement, progress, and bounded-result behavior.
- [x] Resolve model-selected `workdir` under `context.workspaceRoot` before sending a workspace-relative path; never accept workspace identity or policy from tool arguments.
- [x] Cancel the socket request when `context.signal` aborts and return a bounded tool failure if the runner is unavailable.
- [x] Keep tool governance truthful: mark Bash writable because commands can persist workspace changes; network access remains denied.
- [x] Configure the API container's runner socket path while keeping the image Distroless and without installing Bash or Python there.

## Task 3: Wire the sidecar into the Pod

**Files:**

- Modify: `k8s/base/deployment.yaml`
- Modify: `k8s/overlays/gcp-dev/configmap.yaml`
- Modify: `k8s/overlays/gcp-prod/configmap.yaml`

- [x] Mount one shared workspace-cache `emptyDir` at the same absolute path in both containers so the authenticated runtime's resolved workspace path remains valid in the runner.
- [x] Mount a separate Unix-socket `emptyDir` only into minder-serve and the runner.
- [x] Add the runner container with the runner image, non-root UID/GID 65532, no privilege escalation, read-only root filesystem, dropped capabilities, resource requests/limits, and no `envFrom` secrets.
- [x] Configure the runner to use the shared cache, private socket, bounded output settings, and no external network allowlist.
- [x] Ensure Pod readiness fails if the local runner socket cannot be reached; disable automatic service-account token mounting.
- [x] Do not change Services, public routes, service account permissions, or production deployment state.

## Task 4: Document operation and inspect deployment output

**Files:**

- Modify: `docs/superpowers/specs/2026-09-23-shared-workspace-sandbox-design.md`
- Modify: `README.md`

- [x] Document the runner image, required GKE user-namespace/Bubblewrap support, socket/cache mounts, supported Bash/Python invocation form, and fail-closed behavior.
- [x] Render both development and production manifests and inspect the resulting sidecar security context and mounts.
- [x] Run the repository typecheck/build and lint; do not deploy or push images.
- [x] Report that actual GKE Bubblewrap namespace startup remains unverified; no cluster execution was requested.
