import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import {
  SkillClientError,
  type CreateSkillInput,
  type ISkillClient,
  type UpdateSkillInput,
} from '@application/skill/interfaces/i-skill-client';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { toInputSchema, toolError, toolResult } from '@presentation/mcp/mcp-tool-server';

/** Everything one open skill-MCP session needs to dispatch a tool call. */
export interface SkillMcpContext {
  readonly client: ISkillClient;
}

// Mirror the minder-agent write contract (see minder-skills `is_valid_skill_name`):
// a skill file is written to disk as `{name}.md`, so the name must match this
// pattern, and description/namespace become single frontmatter lines so neither
// may contain a newline.
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

/**
 * MCP tool handlers for reading and writing project skills. These proxy
 * straight to minder-agent's `/skills` HTTP API via `MinderAgentSkillClient`
 * — there is no separate action catalog or approval gate in this adapter
 * (runtime governance can still gate the MCP call; skills are project-local
 * files owned by the runtime, not celesnity-core domain entities), so the
 * shape is intentionally simpler than
 * `automation-workflow-mcp-tools.ts`.
 */
export function buildSkillMcpTools(context: SkillMcpContext): readonly McpToolHandler[] {
  return [
    {
      tool: {
        name: 'list_skills',
        description:
          'List every skill available to the agent — both project skills (writable) and ' +
          'global skills (read-only), each tagged with its source. Call this before creating a ' +
          'skill to avoid a name collision and to see the house style of existing skills.',
        inputSchema: toInputSchema({ type: 'object', properties: {}, additionalProperties: false }),
      },
      call: () => handleList(context),
    },
    {
      tool: {
        name: 'get_skill',
        description:
          'Read one skill in full, including its markdown body. Use this to inspect an existing ' +
          'skill before editing it, or to study a well-written skill as a template.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The exact skill name, e.g. "code-review".' },
          },
          required: ['name'],
          additionalProperties: false,
        }),
      },
      call: (args) => handleGet(args, context),
    },
    {
      tool: {
        name: 'create_skill',
        description:
          'Create a new project skill. A skill is a reusable, named set of markdown instructions ' +
          'the agent can invoke later. The name is permanent and must be lowercase letters, ' +
          'digits, and hyphens, starting with a letter or digit (e.g. "data-quality-check"). ' +
          'description and namespace are single lines (no newlines). Put the actual instructions ' +
          'in body as markdown. Fails if the name is already taken.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                'Permanent skill name: lowercase letters, digits, hyphens, starting with a ' +
                'letter or digit (e.g. "weekly-report").',
            },
            description: {
              type: 'string',
              description: 'One short single-line summary shown in the skill list. No newlines.',
            },
            namespace: {
              type: 'string',
              description: 'Optional single-line grouping label. No newlines. Pass "" if none.',
            },
            body: {
              type: 'string',
              description: 'The markdown instructions the agent follows when this skill runs.',
            },
          },
          required: ['name', 'description', 'body'],
          additionalProperties: false,
        }),
      },
      call: (args) => handleCreate(args, context),
    },
    {
      tool: {
        name: 'update_skill',
        description:
          "Update an existing project skill's description, namespace, and body. The name cannot " +
          'be changed. Only project skills can be updated — updating a global skill fails. Read ' +
          'the skill first with get_skill so you preserve the parts you are not changing.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The exact name of the project skill to update.' },
            description: { type: 'string', description: 'New single-line summary. No newlines.' },
            namespace: {
              type: 'string',
              description: 'New single-line grouping label. No newlines. Pass "" to clear it.',
            },
            body: {
              type: 'string',
              description: 'The full new markdown body (replaces the old body).',
            },
          },
          required: ['name', 'description', 'body'],
          additionalProperties: false,
        }),
      },
      call: (args) => handleUpdate(args, context),
    },
    {
      tool: {
        name: 'delete_skill',
        description:
          'Delete a project skill permanently. Only project skills can be deleted; deleting a ' +
          'global skill fails. This cannot be undone, so confirm the name is correct first.',
        inputSchema: toInputSchema({
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The exact name of the project skill to delete.' },
          },
          required: ['name'],
          additionalProperties: false,
        }),
      },
      call: (args) => handleDelete(args, context),
    },
  ];
}

async function handleList(ctx: SkillMcpContext): Promise<CallToolResult> {
  return run(async () => {
    const skills = await ctx.client.list();
    return toolResult(JSON.stringify(skills, null, 2));
  });
}

async function handleGet(
  args: Record<string, unknown>,
  ctx: SkillMcpContext,
): Promise<CallToolResult> {
  const name = requireString(args, 'name');
  if (name === undefined) return toolError('Missing required argument: name');
  return run(async () => {
    const detail = await ctx.client.get(name);
    if (detail === undefined) return toolError(`No skill named "${name}"`);
    return toolResult(JSON.stringify(detail, null, 2));
  });
}

async function handleCreate(
  args: Record<string, unknown>,
  ctx: SkillMcpContext,
): Promise<CallToolResult> {
  const name = requireString(args, 'name');
  if (name === undefined) return toolError('Missing required argument: name');
  if (!SKILL_NAME_PATTERN.test(name)) {
    return toolError(
      `Invalid skill name "${name}": use lowercase letters, digits, and hyphens, starting with a letter or digit (e.g. "data-quality-check").`,
    );
  }
  const description = requireString(args, 'description');
  if (description === undefined) return toolError('Missing required argument: description');
  const body = requireString(args, 'body');
  if (body === undefined) return toolError('Missing required argument: body');
  const namespace = optionalString(args, 'namespace') ?? '';

  const fieldError = validateSingleLine({ description, namespace });
  if (fieldError !== undefined) return toolError(fieldError);

  const input: CreateSkillInput = { name, description, namespace, body };
  return run(async () => {
    const created = await ctx.client.create(input);
    return toolResult(JSON.stringify(created, null, 2));
  });
}

async function handleUpdate(
  args: Record<string, unknown>,
  ctx: SkillMcpContext,
): Promise<CallToolResult> {
  const name = requireString(args, 'name');
  if (name === undefined) return toolError('Missing required argument: name');
  const description = requireString(args, 'description');
  if (description === undefined) return toolError('Missing required argument: description');
  const body = requireString(args, 'body');
  if (body === undefined) return toolError('Missing required argument: body');
  const namespace = optionalString(args, 'namespace') ?? '';

  const fieldError = validateSingleLine({ description, namespace });
  if (fieldError !== undefined) return toolError(fieldError);

  const input: UpdateSkillInput = { name, description, namespace, body };
  return run(async () => {
    const updated = await ctx.client.update(input);
    return toolResult(JSON.stringify(updated, null, 2));
  });
}

async function handleDelete(
  args: Record<string, unknown>,
  ctx: SkillMcpContext,
): Promise<CallToolResult> {
  const name = requireString(args, 'name');
  if (name === undefined) return toolError('Missing required argument: name');
  return run(async () => {
    await ctx.client.delete(name);
    return toolResult(`Skill "${name}" deleted.`);
  });
}

// --- shared helpers ---

/** Turn a `SkillClientError` (e.g. name taken, global read-only) into a clean tool error instead of a 500. */
async function run(call: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof SkillClientError) return toolError(error.message);
    const message = error instanceof Error ? error.message : String(error);
    return toolError(message);
  }
}

function validateSingleLine(fields: {
  readonly description: string;
  readonly namespace: string;
}): string | undefined {
  if (fields.description.includes('\n')) return 'description must be a single line (no newlines).';
  if (fields.namespace.includes('\n')) return 'namespace must be a single line (no newlines).';
  return undefined;
}

function requireString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  return requireString(args, key);
}
