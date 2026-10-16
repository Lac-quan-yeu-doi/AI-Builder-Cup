import type { CreateSkillUseCase } from '@/src/application/use-cases/skills/create-skill.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { CreateSkillInput, SkillDetail } from '@/src/entities/models/skill';

import { createSkillInputSchema } from './skill.schemas';

export type CreateSkillController = ReturnType<typeof createCreateSkillController>;

export const createCreateSkillController =
  (useCase: CreateSkillUseCase): ((input: CreateSkillInput) => Promise<SkillDetail>) =>
  async (input) => {
    const parsed = createSkillInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid skill input', { cause: parsed.error });
    }
    return useCase(parsed.data);
  };
