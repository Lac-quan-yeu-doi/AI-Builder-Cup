import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';

export type ResolveOnboardingPresentationInput =
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

export type RecordOnboardingDecisionPresentationInput =
  | {
      readonly outcome: 'OPEN_TUTORIAL_DETAIL';
      readonly invitationVisible: false;
      readonly tutorialId: string;
    }
  | {
      readonly outcome: 'INVITATION_CLOSED';
      readonly invitationVisible: false;
    }
  | {
      readonly outcome: 'PERSISTENCE_FAILED';
      readonly invitationVisible: true;
      readonly failureExplanation: string;
    };

export interface OnboardingRecommendationViewModel {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly learningOutcomes: readonly string[];
  readonly estimatedMinutes: number;
  readonly stepCount: number;
}

export type ResolvedOnboardingViewModel =
  | {
      readonly outcome: 'NOT_PRESENTED';
      readonly invitationVisible: false;
    }
  | {
      readonly outcome: 'RECOMMENDATION_AVAILABLE';
      readonly invitationVisible: true;
      readonly recommendation: OnboardingRecommendationViewModel;
    }
  | {
      readonly outcome: 'NO_STARTER_AVAILABLE';
      readonly invitationVisible: true;
      readonly dismissalAvailable: true;
    };

export type RecordedOnboardingDecisionViewModel = RecordOnboardingDecisionPresentationInput;

function presentOnboardingRecommendation(
  recommendation: PublishedCatalogTutorial,
): OnboardingRecommendationViewModel {
  return Object.freeze({
    id: recommendation.id,
    title: recommendation.title,
    summary: recommendation.summary,
    category: recommendation.category,
    learningOutcomes: Object.freeze(recommendation.learningOutcomes.map((outcome) => outcome)),
    estimatedMinutes: recommendation.estimatedMinutes,
    stepCount: recommendation.stepCount,
  });
}

export function presentResolvedOnboarding(
  input: ResolveOnboardingPresentationInput,
): ResolvedOnboardingViewModel {
  switch (input.outcome) {
    case 'NOT_PRESENTED':
      return Object.freeze({
        outcome: input.outcome,
        invitationVisible: input.invitationVisible,
      });
    case 'RECOMMENDATION_AVAILABLE':
      return Object.freeze({
        outcome: input.outcome,
        invitationVisible: input.invitationVisible,
        recommendation: presentOnboardingRecommendation(input.recommendation),
      });
    case 'NO_STARTER_AVAILABLE':
      return Object.freeze({
        outcome: input.outcome,
        invitationVisible: input.invitationVisible,
        dismissalAvailable: input.dismissalAvailable,
      });
  }
}

export function presentRecordedOnboardingDecision(
  input: RecordOnboardingDecisionPresentationInput,
): RecordedOnboardingDecisionViewModel {
  switch (input.outcome) {
    case 'OPEN_TUTORIAL_DETAIL':
      return Object.freeze({
        outcome: input.outcome,
        invitationVisible: input.invitationVisible,
        tutorialId: input.tutorialId,
      });
    case 'INVITATION_CLOSED':
      return Object.freeze({
        outcome: input.outcome,
        invitationVisible: input.invitationVisible,
      });
    case 'PERSISTENCE_FAILED':
      return Object.freeze({
        outcome: input.outcome,
        invitationVisible: input.invitationVisible,
        failureExplanation: input.failureExplanation,
      });
  }
}
