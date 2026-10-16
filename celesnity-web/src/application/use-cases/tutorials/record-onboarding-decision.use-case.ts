import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialId } from '@/src/entities/models/tutorial-definition';

export type RecordOnboardingDecisionInput =
  | {
      readonly decision: 'accepted';
      readonly tutorialId: TutorialId;
    }
  | {
      readonly decision: 'dismissed';
    };

export const onboardingDecisionPersistenceFailureExplanation =
  'The onboarding choice could not be saved. The invitation remains open.';

export type RecordOnboardingDecisionResult =
  | {
      readonly outcome: 'OPEN_TUTORIAL_DETAIL';
      readonly invitationVisible: false;
      readonly tutorialId: TutorialId;
    }
  | {
      readonly outcome: 'INVITATION_CLOSED';
      readonly invitationVisible: false;
    }
  | {
      readonly outcome: 'PERSISTENCE_FAILED';
      readonly invitationVisible: true;
      readonly failureExplanation: typeof onboardingDecisionPersistenceFailureExplanation;
    };

export type RecordOnboardingDecisionUseCase = ReturnType<
  typeof createRecordOnboardingDecisionUseCase
>;

/**
 * Persists the member's onboarding choice before returning the requested UI
 * transition. Persistence failures keep the invitation visible and intentionally
 * omit the repository error so infrastructure details cannot reach the member.
 */
export const createRecordOnboardingDecisionUseCase =
  (progressRepository: Pick<TutorialProgressRepository, 'saveOnboardingDecision'>) =>
  async (input: RecordOnboardingDecisionInput): Promise<RecordOnboardingDecisionResult> => {
    try {
      await progressRepository.saveOnboardingDecision(input.decision);
    } catch {
      return {
        outcome: 'PERSISTENCE_FAILED',
        invitationVisible: true,
        failureExplanation: onboardingDecisionPersistenceFailureExplanation,
      };
    }

    if (input.decision === 'accepted') {
      return {
        outcome: 'OPEN_TUTORIAL_DETAIL',
        invitationVisible: false,
        tutorialId: input.tutorialId,
      };
    }

    return {
      outcome: 'INVITATION_CLOSED',
      invitationVisible: false,
    };
  };
