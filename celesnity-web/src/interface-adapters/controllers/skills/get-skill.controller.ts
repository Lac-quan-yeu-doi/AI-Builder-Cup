import type { GetSkillUseCase } from '@/src/application/use-cases/skills/get-skill.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { SkillDetail } from '@/src/entities/models/skill';

import { getSkillInputSchema } from './skill.schemas';

export type GetSkillController = ReturnType<typeof createGetSkillController>;

export const createGetSkillController =
  (useCase: GetSkillUseCase): ((name: string) => Promise<SkillDetail>) =>
  async (name) => {
    const parsed = getSkillInputSchema.safeParse(name);
    if (!parsed.success) {
      throw new InputParseError('Invalid skill name', { cause: parsed.error });
    }
    return useCase(parsed.data);
  };
