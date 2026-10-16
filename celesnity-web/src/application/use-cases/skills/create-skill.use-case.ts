import type { SkillRepository } from '@/src/application/repositories/skill.repository.interface';
import type { CreateSkillInput } from '@/src/entities/models/skill';

export type CreateSkillUseCase = ReturnType<typeof createCreateSkillUseCase>;

export const createCreateSkillUseCase =
  (repository: SkillRepository) => (input: CreateSkillInput) =>
    repository.create(input);
