# Shared Workspace Command Sandbox Design

**Date:** 2026-09-23

## Goal

Let the agent run Bash commands and Python snippets against files in its
current room workspace. Use one shared sandbox runner for all workspaces, while
each command can access only the workspace supplied by its authorized run.

## Current State

- `BashTool` in `src/infrastructure/tools/core/bash.ts` runs a small fixed list
  of read-only commands with `spawn(..., shell: false)`. Python and general Bash
  syntax are unavailable.
- `ToolContext` already supplies `workspaceRoot`, `workingDirectory`, an abort
  signal, and optional progress reporting.
- Runtime workspaces are hydrated under the configured workspace cache and
  synchronized with the room's S3-backed workspace. The production container
  is Distroless Node and does not include Bash, Python, or Bubblewrap.
- `.references/pi/packages/coding-agent/examples/extensions/sandbox/index.ts`
  initializes one `SandboxManager` and wraps each Bash invocation. Pi's Linux
  sandbox uses Bubblewrap; its example also requires `socat` and `ripgrep`.

## Chosen Approach

Run a single sandbox-runner sidecar with each `minder-agent` Pod. The main
service stays Distroless. The runner initializes one Pi-compatible
`SandboxManager` at startup and wraps each command separately. It is shared by
all rooms handled by that Pod; it is not a separate sandbox service per room
or file.

The agent calls the runner over a Unix-domain socket mounted only into the
Minder and runner containers. The request contains the command, the server-resolved current room
workspace root, working directory, and an invocation identifier. The
runner rejects roots outside the configured workspace cache, resolves the
working directory beneath the room root, then wraps and executes the command
with per-command filesystem rules that deny the workspace cache by default and
allow only the active room root plus fixed runtime files. It must not accept an
owner, room root, or policy supplied by the model. Pin an upstream release that
supports per-command filesystem rules on Linux; do not copy Pi's broad local
developer read policy into this multi-room service.

The runner pins `@anthropic-ai/sandbox-runtime` 0.0.76. Startup checks require
Bubblewrap, socat, ripgrep, the bundled seccomp helper, and a successful
sandboxed `true` command before the socket is reported ready.

The sandbox defaults to no network access. Commands can read and write the
active workspace; known credential filenames (`.env`, non-template
`.env.*`, `credentials.json`, `service-account.json`, SSH private keys, `.npmrc`,
and `.pypirc`) are denied. Scratch output is written under a temporary
directory scoped to the invocation and exposed to the command as `$TMPDIR`. The
runner returns bounded combined stdout/stderr, exit status, and interruption
state. Bash has no automatic execution timeout; cancellation or client
disconnect terminates its process group. Command output remains bounded.

## Responsibilities

| Component | Owns |
| --- | --- |
| `BashTool` | Tool contract and model-visible command input; passes trusted runtime workspace context to the runner. |
| Sandbox execution port/client | Unix-socket request, response, abort, and progress translation. |
| Sandbox runner sidecar | One-time SandboxManager initialization, per-command Bubblewrap policy, Bash/Python process lifecycle, bounded output. |
| Workspace provider | Existing owner/room workspace resolution, hydration, and synchronization. |
| Kubernetes Pod | Shared workspace-cache volume and private socket volume; runner receives no application secrets or external service configuration. |

The sandbox does not select agents, authorize callers, resolve rooms, or choose
workspaces. Those remain responsibilities of the authenticated runtime.

## Command Flow

1. The authenticated runtime resolves the run and constructs its current
   `ToolContext` as it does today.
2. The model calls `Bash` with a command. Commands such as `python3 -c ...` and
   Python scripts use this same tool; a second Python-only tool is unnecessary.
3. `BashTool` sends the command and trusted workspace paths to the local runner.
4. The runner validates the paths, wraps the command with the shared
   `SandboxManager`, and starts Bash in the active workspace.
5. The command can read and write the active workspace, has no network access,
   and cannot access known sensitive files. The runner returns bounded output
   to the tool loop.
6. The existing tool-result and file-access reporting paths record the
   command's outcome without persisting secrets or command environment values.

## Isolation and Failure Behavior

- The runner is not reachable through a Service or public HTTP route; only the
  Minder and runner containers have the socket mount.
- The Pod does not auto-mount its Kubernetes service-account token; the existing
  Core workload-identity client uses the GKE metadata identity endpoint.
- Each invocation can read only its resolved room workspace and fixed runtime
  files required to run Bash/Python. It cannot read another room workspace,
  application credentials, or Kubernetes credentials.
- Executed commands can modify workspace files. Per-invocation scratch space
  is removed after completion or interruption; workspace changes persist and
  sync through the existing workspace provider.
- Network access is denied. Installing packages during a command is outside
  the first version; required Python libraries must be included in the runner
  image.
- If Bubblewrap initialization or wrapping fails, execution fails closed. The
  runner never retries the command unsandboxed.
- Cancellation, runner unavailability, invalid paths, and non-zero exit status
  return bounded tool errors; they do not terminate the API process.
- The runner reports ready only after its sandbox prerequisites and a real
  Bubblewrap execution probe succeed; Kubernetes Pod readiness waits for the
  runner socket probe.
  The GKE deployment must verify Bubblewrap's required namespace support under
  the existing non-root, no-capabilities security profile before rollout.

## Deployment Changes

- Add a runner image containing the pinned sandbox runtime, Bash, Python,
  Bubblewrap, `socat`, and `ripgrep`.
- Mount the existing configured workspace cache into both containers. Give the
  runner a separate socket volume and no application `envFrom` secrets.
- Keep the socket and runner internal to the Pod. Preserve the main container's
  Distroless image, service account, and existing API endpoints.
- Do not add a Kubernetes Job per command, a database table for sandbox state,
  or a new public execution API.

## Acceptance Criteria

- One SandboxManager is initialized per runner process and is shared across
  room executions.
- An agent can run multi-command Bash and Python snippets against the active
  room workspace and receive bounded output and exit status.
- Commands cannot read a second room workspace, access application credentials,
  use the network, or continue after cancellation. They can persist changes to
  the active workspace and have no automatic runtime timeout.
- Sandbox startup or per-command wrapper failure never falls back to host
  execution.
- GKE can start the runner under the declared non-root security context and
  execute a sandboxed command with Bubblewrap.

## Non-Goals

- Per-room persistent containers or interactive terminals.
- Network-enabled shell commands, package installation, or arbitrary
  user-configured network allowlists.
- Python package installation from chat.
- PDF/OCR/vision extraction, indexing, or citation UI; those remain file
  analysis capabilities layered on top of workspace access.
- Changing platform Documents or moving chat uploads into the platform
  document library.
