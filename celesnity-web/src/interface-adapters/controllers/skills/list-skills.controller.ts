import type { ListSkillsUseCase } from '@/src/application/use-cases/skills/list-skills.use-case';
import type { SkillSummary } from '@/src/entities/models/skill';

export type ListSkillsController = ReturnType<typeof createListSkillsController>;

export const createListSkillsController =
  (useCase: ListSkillsUseCase): (() => Promise<readonly SkillSummary[]>) =>
  () =>
    useCase();
