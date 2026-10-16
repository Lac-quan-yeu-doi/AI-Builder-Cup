# Agent manifest examples

These YAML files are paste-ready examples for the Celesnity Administration →
Agents editor. Copy one into the **Manifest YAML** field, change `name` in
both the YAML and the **Agent name** field, click **Validate**, then save it.

## Start from the template

Use [`template.yaml`](./template.yaml) for a new agent. It includes every
optional section accepted by the manifest loader, so the configuration can be
expanded without guessing field names.

## Rules

- `name` must contain only lowercase letters, numbers, and hyphens.
- The YAML `name` must exactly match the Agent name field and the intended
  `agents/<name>.yaml` object name.
- Keep `system_prompt` inline when pasting into the web editor. File-based
  prompts are supported by the runtime but require the referenced prompt file
  to exist in the same tenant workspace.
- Run **Validate** before **Save manifest**. Validation uses the same parser as
  the runtime and does not write to S3.
- Use `governance.auto_approvals` for a small, explicit list of runtime tool
  names that may skip the approval pause. For example,
  `mcp__warehouse__query`. Budget, sandbox, sensitive-file, and unavailable
  governance checks still deny the call; this is not a global approval bypass.

The other files in this directory are examples of the built-in
chat, chart encoding, plant model, skills, and automation agents. Deployments
use immutable copies under `migrations/agent-manifests/` and never replace an
organization's edited manifest. To change a bundled default, add a new versioned
migration instead of rewriting an applied migration's snapshot or hash.
The Administration editor also provides
a **Copy YAML** action when an existing tenant agent is selected.
