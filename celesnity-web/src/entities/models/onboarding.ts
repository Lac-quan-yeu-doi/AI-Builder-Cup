import type { WorkspaceFeature } from './workspace-feature';

/** Persisted choice controlling automatic onboarding presentation. */
export type OnboardingDecision = 'accepted' | 'dismissed';

export interface OnboardingRecommendationCandidate {
  readonly requiredFeatures: readonly WorkspaceFeature[];
}

/**
 * Onboarding is automatically presented only until the member records a choice
 * for the current organization.
 */
export function shouldAutoPresentOnboarding(persistedDecision: OnboardingDecision | null): boolean {
  return persistedDecision === null;
}

/**
 * Selects the first onboarding candidate whose complete feature requirement is
 * accessible, preserving catalog order. An empty requirement set is accessible.
 */
export function selectAccessibleRecommendation<Candidate extends OnboardingRecommendationCandidate>(
  candidates: readonly Candidate[],
  accessibleFeatures: readonly WorkspaceFeature[],
): Candidate | null {
  const accessibleFeatureSet = new Set<WorkspaceFeature>(accessibleFeatures);

  return (
    candidates.find((candidate) =>
      candidate.requiredFeatures.every((feature) => accessibleFeatureSet.has(feature)),
    ) ?? null
  );
}
