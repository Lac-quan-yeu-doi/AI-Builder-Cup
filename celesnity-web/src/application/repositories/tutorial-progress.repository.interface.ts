import type { OnboardingDecision } from '@/src/entities/models/onboarding';
import type { CompletionRecord, ProgressRecord } from '@/src/entities/models/tutorial-progress';

export interface TutorialProgressRepository {
  listForMember(): Promise<readonly ProgressRecord[]>;
  save(record: ProgressRecord): Promise<ProgressRecord>;
  getOnboardingDecision(): Promise<OnboardingDecision | null>;
  saveOnboardingDecision(decision: OnboardingDecision): Promise<OnboardingDecision>;

  /** Persists at most one completion record for a tutorial run. */
  saveCompletion(runId: string): Promise<CompletionRecord>;
}
