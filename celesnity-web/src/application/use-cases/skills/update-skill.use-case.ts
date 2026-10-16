import type { SkillRepository } from '@/src/application/repositories/skill.repository.interface';
import type { UpdateSkillInput } from '@/src/entities/models/skill';

export type UpdateSkillUseCase = ReturnType<typeof createUpdateSkillUseCase>;

export const createUpdateSkillUseCase =
  (repository: SkillRepository) => (input: UpdateSkillInput) =>
    repository.update(input);
