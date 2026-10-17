/**
 * Step 06 — gives the chat and plant-model assistants the plant context.
 *
 * Both demos share one workspace and one agent prompt, so this applies the
 * context of Demo Data 1 AND Demo Data 2 (see ../../lib/agent-context.mjs and
 * ../agent-context.mjs). Saved as an organization override through the agent
 * manifest API, so it is not version controlled: re-apply after the agent's
 * manifest store is reset. `--revert` saves the repo YAML back (never DELETE).
 * `--print` shows the header without saving it.
 *
 *   node mock-data/demo2-coffee-capsules/seed/06-agents.mjs [--revert] [--print]
 */
import { WORKSPACE_HEADER, applyAgentContext } from '../../lib/agent-context.mjs';

if (process.argv.includes('--print')) {
  console.log(WORKSPACE_HEADER);
} else {
  await applyAgentContext({ revert: process.argv.includes('--revert') });
}
