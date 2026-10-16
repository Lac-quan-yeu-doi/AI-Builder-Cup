import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { buildSkillMcpTools, type SkillMcpContext } from '@presentation/skill/skill-mcp-tools';
import {
  SkillClientError,
  type CreateSkillInput,
  type ISkillClient,
  type SkillDetail,
  type SkillSummary,
  type UpdateSkillInput,
} from '@application/skill/interfaces/i-skill-client';

function summary(overrides: Partial<SkillSummary> = {}): SkillSummary {
  return {
    name: 'code-review',
    description: 'Review a diff for correctness.',
    namespace: 'engineering',
    source: 'project',
    ...overrides,
  };
}

function detail(overrides: Partial<SkillDetail> = {}): SkillDetail {
  return { ...summary(), body: '# Code review\n\nDo the thing.', ...overrides };
}

type StubClient = Pick<ISkillClient, 'list' | 'get' | 'create' | 'update' | 'delete'>;

function context(overrides: Partial<StubClient> = {}): SkillMcpContext {
  const client: StubClient = {
    list: async () => [summary()],
    get: async () => detail(),
    create: async (input: CreateSkillInput) => detail(input),
    update: async (input: UpdateSkillInput) => detail(input),
    delete: async () => undefined,
    ...overrides,
  };
  return { client };
}

function toolByName(ctx: SkillMcpContext, name: string) {
  const handler = buildSkillMcpTools(ctx).find((entry) => entry.tool.name === name);
  if (handler === undefined) throw new Error(`no tool ${name}`);
  return handler;
}

function text(result: CallToolResult): string {
  const first = result.content[0];
  return first !== undefined && first.type === 'text' ? first.text : '';
}

describe('buildSkillMcpTools', () => {
  it('exposes exactly the five skill tools', () => {
    const names = buildSkillMcpTools(context()).map((entry) => entry.tool.name);
    expect(names).toEqual([
      'list_skills',
      'get_skill',
      'create_skill',
      'update_skill',
      'delete_skill',
    ]);
  });

  describe('list_skills', () => {
    it('returns the client summaries as JSON', async () => {
      const result = await toolByName(context(), 'list_skills').call({});
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(text(result))).toEqual([summary()]);
    });
  });

  describe('get_skill', () => {
    it('requires a name', async () => {
      const result = await toolByName(context(), 'get_skill').call({});
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('name');
    });

    it('reports a missing skill without throwing', async () => {
      const ctx = context({ get: async () => undefined });
      const result = await toolByName(ctx, 'get_skill').call({ name: 'nope' });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('No skill');
    });

    it('returns the detail as JSON', async () => {
      const result = await toolByName(context(), 'get_skill').call({ name: 'code-review' });
      expect(JSON.parse(text(result))).toEqual(detail());
    });
  });

  describe('create_skill', () => {
    it('rejects an invalid name before calling the client', async () => {
      const create = jest.fn();
      const ctx = context({ create });
      const result = await toolByName(ctx, 'create_skill').call({
        name: 'Bad Name',
        description: 'x',
        body: 'y',
      });
      expect(result.isError).toBe(true);
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a newline in description', async () => {
      const result = await toolByName(context(), 'create_skill').call({
        name: 'good-name',
        description: 'line one\nline two',
        body: 'y',
      });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('single line');
    });

    it('defaults namespace to empty and forwards to the client', async () => {
      const create = jest.fn(async (input: CreateSkillInput) => detail(input));
      const ctx = context({ create });
      const result = await toolByName(ctx, 'create_skill').call({
        name: 'weekly-report',
        description: 'Summarize the week.',
        body: '# Weekly report',
      });
      expect(result.isError).toBeUndefined();
      expect(create).toHaveBeenCalledWith({
        name: 'weekly-report',
        description: 'Summarize the week.',
        namespace: '',
        body: '# Weekly report',
      });
    });

    it('turns a name-taken conflict into a clean tool error', async () => {
      const ctx = context({
        create: async () => {
          throw new SkillClientError(409, 'skill_name_taken', 'skill "x" already exists');
        },
      });
      const result = await toolByName(ctx, 'create_skill').call({
        name: 'taken',
        description: 'x',
        body: 'y',
      });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('already exists');
    });
  });

  describe('update_skill', () => {
    it('forwards the update to the client', async () => {
      const update = jest.fn(async (input: UpdateSkillInput) => detail(input));
      const ctx = context({ update });
      await toolByName(ctx, 'update_skill').call({
        name: 'code-review',
        description: 'Updated.',
        namespace: 'eng',
        body: '# New body',
      });
      expect(update).toHaveBeenCalledWith({
        name: 'code-review',
        description: 'Updated.',
        namespace: 'eng',
        body: '# New body',
      });
    });
  });

  describe('delete_skill', () => {
    it('deletes by name', async () => {
      const del = jest.fn(async () => undefined);
      const ctx = context({ delete: del });
      const result = await toolByName(ctx, 'delete_skill').call({ name: 'code-review' });
      expect(result.isError).toBeUndefined();
      expect(del).toHaveBeenCalledWith('code-review');
      expect(text(result)).toContain('deleted');
    });
  });
});
