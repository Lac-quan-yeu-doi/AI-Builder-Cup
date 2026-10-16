import type { UpdateSkillUseCase } from '@/src/application/use-cases/skills/update-skill.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { SkillDetail, UpdateSkillInput } from '@/src/entities/models/skill';

import { updateSkillInputSchema } from './skill.schemas';

export type UpdateSkillController = ReturnType<typeof createUpdateSkillController>;

export const createUpdateSkillController =
  (useCase: UpdateSkillUseCase): ((input: UpdateSkillInput) => Promise<SkillDetail>) =>
  async (input) => {
    const parsed = updateSkillInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid skill update', { cause: parsed.error });
    }
    return useCase(parsed.data);
  };
