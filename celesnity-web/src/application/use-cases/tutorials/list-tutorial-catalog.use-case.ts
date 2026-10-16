import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import {
  filterCatalog,
  type PublishedCatalogTutorial,
} from '@/src/entities/models/tutorial-catalog';
import { progressPercentage, type TutorialStatus } from '@/src/entities/models/tutorial-progress';

export interface ListTutorialCatalogInput {
  readonly searchTerm: string;
  readonly statusFilters: readonly TutorialStatus[];
}

export interface ListedCatalogTutorial extends PublishedCatalogTutorial {
  readonly status: TutorialStatus;
  readonly progressPercentage?: number;
}

export type ListTutorialCatalogUseCase = ReturnType<typeof createListTutorialCatalogUseCase>;

export const createListTutorialCatalogUseCase =
  (tutorialRepository: TutorialRepository, progressRepository: TutorialProgressRepository) =>
  async ({
    searchTerm,
    statusFilters,
  }: ListTutorialCatalogInput): Promise<readonly ListedCatalogTutorial[]> => {
    const [catalog, progressRecords] = await Promise.all([
      tutorialRepository.listAccessibleCatalog(),
      progressRepository.listForMember(),
    ]);
    const progressByTutorialId = new Map(
      progressRecords.map((record) => [record.tutorialId, record] as const),
    );
    const catalogWithProgress = catalog.map((tutorial): ListedCatalogTutorial => {
      const progress = progressByTutorialId.get(tutorial.id);

      if (progress === undefined) {
        return {
          ...tutorial,
          learningOutcomes: [...tutorial.learningOutcomes],
          status: 'NOT_STARTED',
        };
      }

      return {
        ...tutorial,
        learningOutcomes: [...tutorial.learningOutcomes],
        status: progress.status,
        progressPercentage: progressPercentage(
          new Set(progress.completedStepIds).size,
          tutorial.stepCount,
        ),
      };
    });

    return filterCatalog(catalogWithProgress, searchTerm, statusFilters);
  };
