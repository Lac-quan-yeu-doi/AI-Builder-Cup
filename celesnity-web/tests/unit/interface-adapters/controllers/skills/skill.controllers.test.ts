import { describe, expect, it, vi } from 'vitest';

import type { SkillDetail, SkillSummary } from '@/src/entities/models/skill';
import { createCreateSkillController } from '@/src/interface-adapters/controllers/skills/create-skill.controller';
import { createDeleteSkillController } from '@/src/interface-adapters/controllers/skills/delete-skill.controller';
import { createGetSkillController } from '@/src/interface-adapters/controllers/skills/get-skill.controller';
import { createListSkillsController } from '@/src/interface-adapters/controllers/skills/list-skills.controller';
import { createUpdateSkillController } from '@/src/interface-adapters/controllers/skills/update-skill.controller';
import { skillNameSchema } from '@/src/interface-adapters/controllers/skills/skill.schemas';

const summary: SkillSummary = {
  name: 'skill-one',
  description: 'Builds a report',
  namespace: 'reports',
  source: 'project',
};

const detail: SkillDetail = {
  ...summary,
  body: '# Report\n',
};

const input = {
  name: 'skill-one',
  description: 'Builds a report',
  namespace: 'reports',
  body: '# Report\n',
};

describe('skill controllers', () => {
  it('matches minder-agent name validation, including a trailing hyphen', () => {
    expect(skillNameSchema.parse('skill-one-')).toBe('skill-one-');
    expect(() => skillNameSchema.parse('Invalid_Name')).toThrow();
    expect(() => skillNameSchema.parse('')).toThrow();
  });

  it('lists skills by calling the use case once', async () => {
    const useCase = vi.fn().mockResolvedValue([summary]);
    const controller = createListSkillsController(useCase);

    await expect(controller()).resolves.toEqual([summary]);
    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith();
  });

  it('validates get names before delegating and preserves a valid name', async () => {
    const useCase = vi.fn().mockResolvedValue(detail);
    const controller = createGetSkillController(useCase);

    await expect(controller('skill-one')).resolves.toBe(detail);
    expect(useCase).toHaveBeenCalledWith('skill-one');

    useCase.mockClear();
    await expect(controller('')).rejects.toMatchObject({ name: 'InputParseError' });
    expect(useCase).not.toHaveBeenCalled();
  });

  it('validates create input before delegating and preserves the full command', async () => {
    const useCase = vi.fn().mockResolvedValue(detail);
    const controller = createCreateSkillController(useCase);

    await expect(controller(input)).resolves.toBe(detail);
    expect(useCase).toHaveBeenCalledWith(input);

    useCase.mockClear();
    await expect(controller({ ...input, name: 'Invalid_Name' })).rejects.toMatchObject({
      name: 'InputParseError',
    });
    expect(useCase).not.toHaveBeenCalled();
  });

  it('validates update input before delegating and keeps name as the command identity', async () => {
    const useCase = vi.fn().mockResolvedValue(detail);
    const controller = createUpdateSkillController(useCase);

    await expect(controller(input)).resolves.toBe(detail);
    expect(useCase).toHaveBeenCalledWith({
      name: 'skill-one',
      description: 'Builds a report',
      namespace: 'reports',
      body: '# Report\n',
    });

    useCase.mockClear();
    await expect(controller({ ...input, name: '' })).rejects.toMatchObject({
      name: 'InputParseError',
    });
    expect(useCase).not.toHaveBeenCalled();
  });

  it('validates delete names before delegating and preserves a non-empty name', async () => {
    const useCase = vi.fn().mockResolvedValue(undefined);
    const controller = createDeleteSkillController(useCase);

    await expect(controller('a/b')).resolves.toBeUndefined();
    expect(useCase).toHaveBeenCalledWith('a/b');

    useCase.mockClear();
    await expect(controller('')).rejects.toMatchObject({ name: 'InputParseError' });
    expect(useCase).not.toHaveBeenCalled();
  });
});
