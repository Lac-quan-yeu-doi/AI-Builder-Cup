import type { DeleteSkillUseCase } from '@/src/application/use-cases/skills/delete-skill.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';

import { deleteSkillInputSchema } from './skill.schemas';

export type DeleteSkillController = ReturnType<typeof createDeleteSkillController>;

export const createDeleteSkillController =
  (useCase: DeleteSkillUseCase): ((name: string) => Promise<void>) =>
  async (name) => {
    const parsed = deleteSkillInputSchema.safeParse(name);
    if (!parsed.success) {
      throw new InputParseError('Invalid skill name', { cause: parsed.error });
    }
    await useCase(parsed.data);
  };
