import type { SkillRepository } from '@/src/application/repositories/skill.repository.interface';

export type DeleteSkillUseCase = ReturnType<typeof createDeleteSkillUseCase>;

export const createDeleteSkillUseCase = (repository: SkillRepository) => (name: string) =>
  repository.delete(name);
