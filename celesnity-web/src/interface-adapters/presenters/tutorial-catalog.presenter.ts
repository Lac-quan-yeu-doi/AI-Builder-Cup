import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type { TutorialStatus } from '@/src/entities/models/tutorial-progress';

export interface TutorialCatalogPresentationItem extends PublishedCatalogTutorial {
  readonly status: TutorialStatus;
  readonly progressPercentage?: number;
}

export interface TutorialCardViewModel {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly learningOutcomes: readonly string[];
  readonly estimatedMinutes: number;
  readonly stepCount: number;
  readonly status: TutorialStatus;
  readonly progressPercentage?: number;
}

export interface CatalogViewModel {
  readonly tutorials: readonly TutorialCardViewModel[];
  readonly noResults: boolean;
}

export function presentTutorialCard(
  tutorial: TutorialCatalogPresentationItem,
): TutorialCardViewModel {
  return Object.freeze({
    id: tutorial.id,
    title: tutorial.title,
    summary: tutorial.summary,
    category: tutorial.category,
    learningOutcomes: Object.freeze(tutorial.learningOutcomes.map((outcome) => outcome)),
    estimatedMinutes: tutorial.estimatedMinutes,
    stepCount: tutorial.stepCount,
    status: tutorial.status,
    ...(tutorial.progressPercentage !== undefined
      ? { progressPercentage: tutorial.progressPercentage }
      : {}),
  });
}

/** Maps the already access-filtered catalog to a fresh, safe member-facing view model. */
export function presentTutorialCatalog(
  tutorials: readonly TutorialCatalogPresentationItem[],
): CatalogViewModel {
  const presentedTutorials = Object.freeze(tutorials.map(presentTutorialCard));

  return Object.freeze({
    tutorials: presentedTutorials,
    noResults: presentedTutorials.length === 0,
  });
}
