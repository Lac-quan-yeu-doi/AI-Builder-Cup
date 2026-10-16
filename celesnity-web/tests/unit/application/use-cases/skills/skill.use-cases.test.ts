import { describe, expect, it, vi } from 'vitest';

import type { SkillRepository } from '@/src/application/repositories/skill.repository.interface';
import { createCreateSkillUseCase } from '@/src/application/use-cases/skills/create-skill.use-case';
import { createDeleteSkillUseCase } from '@/src/application/use-cases/skills/delete-skill.use-case';
import { createGetSkillUseCase } from '@/src/application/use-cases/skills/get-skill.use-case';
import { createListSkillsUseCase } from '@/src/application/use-cases/skills/list-skills.use-case';
import { createUpdateSkillUseCase } from '@/src/application/use-cases/skills/update-skill.use-case';
import type {
  CreateSkillInput,
  SkillDetail,
  SkillSummary,
  UpdateSkillInput,
} from '@/src/entities/models/skill';

const summary: SkillSummary = {
  name: 'daily-report',
  description: 'Builds the daily report',
  namespace: 'reports',
  source: 'project',
};

const detail: SkillDetail = {
  ...summary,
  body: '# Daily report\n',
};

const createInput: CreateSkillInput = {
  name: summary.name,
  description: summary.description,
  namespace: summary.namespace,
  body: detail.body,
};

const updateInput: UpdateSkillInput = {
  name: summary.name,
  description: 'Builds the updated daily report',
  namespace: summary.namespace,
  body: '# Updated daily report\n',
};

function repository(): SkillRepository {
  return {
    list: vi.fn().mockResolvedValue([summary]),
    get: vi.fn().mockResolvedValue(detail),
    create: vi.fn().mockResolvedValue(detail),
    update: vi.fn().mockResolvedValue(detail),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe('skill use cases', () => {
  it('delegates listing once and returns the repository result', async () => {
    const skillRepository = repository();
    const result = await createListSkillsUseCase(skillRepository)();

    expect(result).toEqual([summary]);
    expect(skillRepository.list).toHaveBeenCalledOnce();
    expect(skillRepository.list).toHaveBeenCalledWith();
  });

  it('delegates getting once with the supplied name and returns the repository result', async () => {
    const skillRepository = repository();
    const result = await createGetSkillUseCase(skillRepository)('daily-report');

    expect(result).toBe(detail);
    expect(skillRepository.get).toHaveBeenCalledOnce();
    expect(skillRepository.get).toHaveBeenCalledWith('daily-report');
  });

  it('delegates creation once with the supplied input and returns the repository result', async () => {
    const skillRepository = repository();
    const result = await createCreateSkillUseCase(skillRepository)(createInput);

    expect(result).toBe(detail);
    expect(skillRepository.create).toHaveBeenCalledOnce();
    expect(skillRepository.create).toHaveBeenCalledWith(createInput);
  });

  it('delegates immutable-name updates once with the supplied input and returns the repository result', async () => {
    const skillRepository = repository();
    const result = await createUpdateSkillUseCase(skillRepository)(updateInput);

    expect(result).toBe(detail);
    expect(skillRepository.update).toHaveBeenCalledOnce();
    expect(skillRepository.update).toHaveBeenCalledWith(updateInput);
  });

  it('delegates deletion once with the supplied name and returns undefined', async () => {
    const skillRepository = repository();
    const result = await createDeleteSkillUseCase(skillRepository)('daily-report');

    expect(result).toBeUndefined();
    expect(skillRepository.delete).toHaveBeenCalledOnce();
    expect(skillRepository.delete).toHaveBeenCalledWith('daily-report');
  });
});
