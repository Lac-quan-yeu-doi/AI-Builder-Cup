/**
 * Gives the chat and plant-model assistants the context of both demo plants.
 *
 * Both demos live in one workspace, and an agent manifest override is per
 * organization, so the two demos must share one prompt: each seed step 06
 * calls this, and it always writes the context of BOTH demos. Running either
 * step 06 (or both, in any order) gives the same result.
 *
 * The header is prepended to the repo YAML's `system_prompt` (minder-agent/agents/)
 * and saved as the organization override with PUT `{ yaml }`, so it takes effect
 * without redeploying the agent. Every existing rule about tools, preview_chart
 * and never showing SQL stays exactly as it is.
 *
 * `--revert` saves the unmodified repo YAML back. It never DELETEs a manifest:
 * outside production the agent has no built-in fallback, so a deleted manifest
 * makes every chat fail with `agent_manifest_not_found`.
 */
import { readFileSync } from 'node:fs';

import { DEMO1_CONTEXT } from '../demo1-home-appliance/agent-context.mjs';
import { DEMO2_CONTEXT } from '../demo2-coffee-capsules/agent-context.mjs';
import { agentFetch } from './http.mjs';

const MARKER = 'DEMO WORKSPACE CONTEXT';
const AGENTS = ['chat-assistant', 'plant-model-assistant'];
const agentsDir = new URL('../../minder-agent/agents/', import.meta.url);

export const WORKSPACE_HEADER = `${MARKER} (highest priority for language and plant facts; every tool and chart rule below still applies unchanged)

This workspace holds two mock plants. Work out which one the question is about before querying:
- Demo Data 1 — home appliance plant (chest freezers): tables in iceberg.demo1_home_appliance.
- Demo Data 2 — coffee capsule plant: tables in iceberg.demo2_coffee_capsules.
Infer the plant from the words and codes used (freezers, PU foam, R600a, LINE_FRZ_*, FZ-* models →
Demo Data 1; capsules, powder, humidity, AHU, CAP_L*, SKUs → Demo Data 2) and answer directly. Ask
which plant only when the question fits both equally. Always write fully qualified table
names (iceberg.<schema>.<table>), and never mix tables from the two schemas in one query.
Both are mock data for a demo; if asked, say so plainly.

${DEMO1_CONTEXT}

${DEMO2_CONTEXT}
---
`;

/**
 * Saves a manifest as the org override. An org override may only reference
 * environment variables the agent has set; when the PUT is rejected for one, the
 * MCP server that needs it (and its tools) is dropped and the save retried.
 */
async function saveManifest(name, yaml) {
  let body = yaml;
  const dropped = [];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await agentFetch(`/agent-manifests/${name}`, { method: 'PUT', body: JSON.stringify({ yaml: body }) });
      break;
    } catch (error) {
      const missing = /environment variable is not approved: ([A-Z0-9_]+)/u.exec(error.message)?.[1];
      if (missing === undefined || attempt > 5) throw error;
      const server = new RegExp(
        `\\n  ([a-z_]+):\\n    url: "\\$\\{${missing}\\}"\\n    headers:\\n(?:      .*\\n)+`,
        'u',
      ).exec(body);
      if (server === null) throw error;
      body = body
        .replace(server[0], '\n')
        .replace(new RegExp(`\\n\\s*- mcp__${server[1]}__[a-z_]+`, 'gu'), '');
      dropped.push(server[1]);
    }
  }
  if (dropped.length > 0) {
    console.log(`${name}: dropped MCP ${dropped.join(', ')} (environment variable not set on this agent)`);
  }
}

export async function applyAgentContext({ revert = false } = {}) {
  for (const name of AGENTS) {
    const yaml = readFileSync(new URL(`${name}.yaml`, agentsDir), 'utf8');
    if (revert) {
      await saveManifest(name, yaml);
      console.log(`${name}: demo context removed, back to the repo manifest`);
      continue;
    }
    const anchor = 'system_prompt: |\n';
    if (!yaml.includes(anchor)) throw new Error(`${name}.yaml has no block-scalar system_prompt`);
    const indented = WORKSPACE_HEADER.split('\n')
      .map((line) => (line === '' ? '' : `  ${line}`))
      .join('\n');
    let patched = yaml.replace(anchor, `${anchor}${indented}\n`);
    /* The long demo prompt is resent on every tool step; the default 128k-token
       run budget runs out before the chart. Give demo questions room to finish. */
    if (patched.includes('\ngovernance:\n') && !patched.includes('\n  budget:\n')) {
      patched = patched.replace(
        '\ngovernance:\n',
        '\ngovernance:\n  budget:\n    max_input_tokens: 900000\n    max_output_tokens: 40000\n    max_tool_calls: 60\n',
      );
    }
    await saveManifest(name, patched);
    const saved = await agentFetch(`/agent-manifests/${name}`);
    const prompt = saved.system_prompt ?? saved.systemPrompt ?? JSON.stringify(saved);
    console.log(
      `${name}: context for both demos applied (${prompt.includes(MARKER) ? 'verified' : 'header NOT found in the saved prompt!'})`,
    );
  }
}
