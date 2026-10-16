import type { SkillRepository } from '@/src/application/repositories/skill.repository.interface';

export type GetSkillUseCase = ReturnType<typeof createGetSkillUseCase>;

export const createGetSkillUseCase = (repository: SkillRepository) => (name: string) =>
  repository.get(name);
