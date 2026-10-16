import type { SkillRepository } from '@/src/application/repositories/skill.repository.interface';

export type ListSkillsUseCase = ReturnType<typeof createListSkillsUseCase>;

export const createListSkillsUseCase = (repository: SkillRepository) => () => repository.list();
