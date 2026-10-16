import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import {
  selectAccessibleRecommendation,
  shouldAutoPresentOnboarding,
} from '@/src/entities/models/onboarding';
import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';

export type ResolveOnboardingResult =
  | {
      readonly outcome: 'NOT_PRESENTED';
      readonly invitationVisible: false;
    }
  | {
      readonly outcome: 'RECOMMENDATION_AVAILABLE';
      readonly invitationVisible: true;
      readonly recommendation: PublishedCatalogTutorial;
    }
  | {
      readonly outcome: 'NO_STARTER_AVAILABLE';
      readonly invitationVisible: true;
      readonly dismissalAvailable: true;
    };

export interface ResolveOnboardingDependencies {
  readonly tutorialRepository: Pick<TutorialRepository, 'listAccessibleCatalog' | 'getDefinition'>;
  readonly progressRepository: Pick<TutorialProgressRepository, 'getOnboardingDecision'>;
  readonly featureAccessService: TutorialFeatureAccessService;
}

export type ResolveOnboardingUseCase = ReturnType<typeof createResolveOnboardingUseCase>;

function copyCatalogTutorial(tutorial: PublishedCatalogTutorial): PublishedCatalogTutorial {
  return {
    ...tutorial,
    learningOutcomes: [...tutorial.learningOutcomes],
  };
}

/**
 * Resolves automatic onboarding for the current member and organization.
 * A persisted decision suppresses the invitation. Otherwise, recommendation
 * access is re-evaluated against current feature access before anything is shown.
 */
export const createResolveOnboardingUseCase =
  (dependencies: ResolveOnboardingDependencies) => async (): Promise<ResolveOnboardingResult> => {
    const decision = await dependencies.progressRepository.getOnboardingDecision();

    if (!shouldAutoPresentOnboarding(decision)) {
      return {
        outcome: 'NOT_PRESENTED',
        invitationVisible: false,
      };
    }

    const [catalog, accessibleFeatures] = await Promise.all([
      dependencies.tutorialRepository.listAccessibleCatalog(),
      dependencies.featureAccessService.accessibleFeatures(),
    ]);
    const candidates = await Promise.all(
      catalog.map(async (tutorial) => {
        const definition = await dependencies.tutorialRepository.getDefinition(tutorial.id);

        return {
          tutorial,
          requiredFeatures: definition.requiredFeatures,
        };
      }),
    );
    const selected = selectAccessibleRecommendation(candidates, accessibleFeatures);

    if (selected === null) {
      return {
        outcome: 'NO_STARTER_AVAILABLE',
        invitationVisible: true,
        dismissalAvailable: true,
      };
    }

    return {
      outcome: 'RECOMMENDATION_AVAILABLE',
      invitationVisible: true,
      recommendation: copyCatalogTutorial(selected.tutorial),
    };
  };
