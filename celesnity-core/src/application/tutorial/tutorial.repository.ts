import type {
  TutorialDefinition,
  TutorialOnboardingDecision,
  TutorialProgress,
} from '@domain/tutorial/models/tutorial';

export const TUTORIAL_REPOSITORY = Symbol('TutorialRepository');
export const TUTORIAL_PROGRESS_REPOSITORY = Symbol('TutorialProgressRepository');

export interface TutorialRepository {
  list(): Promise<readonly TutorialDefinition[]>;
  findById(id: string): Promise<TutorialDefinition | null>;
  publish(definition: TutorialDefinition): Promise<void>;
}

export interface TutorialProgressRepository {
  list(organizationId: string, identityId: string): Promise<readonly TutorialProgress[]>;
  save(progress: TutorialProgress): Promise<TutorialProgress>;
  getOnboardingDecision(
    organizationId: string,
    identityId: string,
  ): Promise<TutorialOnboardingDecision | null>;
  saveOnboardingDecision(
    organizationId: string,
    identityId: string,
    decision: TutorialOnboardingDecision,
  ): Promise<TutorialOnboardingDecision>;
  saveCompletion(
    organizationId: string,
    identityId: string,
    runId: string,
  ): Promise<{ readonly runId: string; readonly completedAt: string }>;
}
