import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import { TutorialAccessError } from '@/src/entities/errors/application-errors';
import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';

export interface OpenTutorialWalkthroughInput {
  readonly runId: string;
  readonly progress: ProgressRecord;
  readonly locale: 'en' | 'vi';
}

export interface OpenedTutorialWalkthrough {
  readonly runId: string;
  readonly progress: ProgressRecord;
  readonly definition: TutorialDefinition;
  readonly nextRecommendation: Pick<PublishedCatalogTutorial, 'id' | 'title'> | null;
  readonly locale: 'en' | 'vi';
}

export type OpenTutorialWalkthroughUseCase = ReturnType<
  typeof createOpenTutorialWalkthroughUseCase
>;

export const createOpenTutorialWalkthroughUseCase =
  (tutorialRepository: Pick<TutorialRepository, 'getDefinition' | 'listAccessibleCatalog'>) =>
  async (input: OpenTutorialWalkthroughInput): Promise<OpenedTutorialWalkthrough> => {
    const [definition, catalog] = await Promise.all([
      tutorialRepository.getDefinition(input.progress.tutorialId),
      tutorialRepository.listAccessibleCatalog(),
    ]);
    if (
      definition.id !== input.progress.tutorialId ||
      !definition.steps.some((step) => step.id === input.progress.currentStepId)
    ) {
      throw new TutorialAccessError();
    }
    const recommendation = catalog.find((tutorial) => tutorial.id !== definition.id) ?? null;
    return {
      runId: input.runId,
      progress: {
        ...input.progress,
        completedStepIds: [...input.progress.completedStepIds],
        contextSelections: input.progress.contextSelections.map((selection) => ({ ...selection })),
      },
      definition,
      nextRecommendation:
        recommendation === null ? null : { id: recommendation.id, title: recommendation.title },
      locale: input.locale,
    };
  };
