---
name: automation-workflows
description: Use when creating, inspecting, editing, enabling, disabling, or testing Celesnity automation workflows and their steps or triggers.
namespace: automation
---

# Automation workflows

Use Core's existing workflow MCP tools. Organization and caller identity come from authenticated context; omit `organization_id` and `created_by`. Workflow mutations are audited, and some may return `pending_approval`; report the pending status and ID instead of claiming the change completed.

## Inspect before changing

1. Call `get_workflow({workflow_id})` before proposing edits. It returns the workflow and its ordered steps.
2. Call `list_available_agents({})` before adding or switching an agent. Use only an exact `agent_id` from its result; never invent one.
3. Propose the intended step and input mapping through the plan-review flow before calling `add_workflow_step`.

`create_workflow` takes `name` and `trigger_type` (`EVENT` or `SCHEDULE`). EVENT workflows use `event_topic`; SCHEDULE workflows use `schedule_cron` and `schedule_timezone`. Supply `trigger_fields` for each distinct `$.trigger.<name>` referenced by steps. Each field has `name`, a `type` (`text`, `number`, `date`, `datetime`, or `boolean`), and optional `label` and `required`.

Each step's `input_template` must contain a non-empty `message` string: the workflow executor reads that field and ignores other input keys. Use a literal message or map values such as `$.trigger.bucket` and `$.step1.output`. Keep the complete task in `message`; don't split it among fields the executor ignores.

## Change and test safely

- `add_workflow_step({workflow_id, agent_id, input_template, system_prompt?})` appends a step. `system_prompt` replaces that agent's default prompt for this step only.
- `update_workflow_step({workflow_id, step_id, agent_id?, input_template?, system_prompt?})` applies immediately. A supplied `input_template` replaces the whole mapping.
- `remove_workflow_step({workflow_id, step_id, rationale?})` requires human approval. Treat a pending-action ID as awaiting a decision, not as a completed removal.
- `update_workflow_trigger` changes the trigger immediately; include the matching event or schedule fields and trigger-field declarations.
- `enable_workflow({workflow_id, enabled})` changes enabled state immediately.
- `test_fire_workflow({workflow_id, payload})` executes the full chain for real with the same side effects as a production trigger. Use it only when the user explicitly asks to run a test and provides or approves the test payload. Do not use it as a harmless validation check. `force_fail_at_step` is a 1-based debugging option to rehearse failure handling without dispatching that step.

## Few-shot patterns

**Create an event workflow:** after confirming the user wants a new automation and collecting its event topic and message inputs, create the empty workflow:

```json
{"name":"Order follow-up","trigger_type":"EVENT","event_topic":"orders.created","trigger_fields":[{"name":"message","type":"text","required":true}]}
```

Then get available agents, propose the exact agent and mapping through plan review, and add the step only after that review. A valid mapping is `{"message":"$.trigger.message"}`; a reference is the entire value, not an interpolation embedded in prose.

**Inspect and disable:** call `get_workflow` with the exact workflow ID, then `enable_workflow({"workflow_id":"<returned-id>","enabled":false})`; state that this applies immediately.
