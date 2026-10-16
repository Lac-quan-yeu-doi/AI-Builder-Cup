import { describe, expect, it } from 'vitest';

import {
  selectAccessibleRecommendation,
  shouldAutoPresentOnboarding,
  type OnboardingRecommendationCandidate,
} from '@/src/entities/models/onboarding';

interface Candidate extends OnboardingRecommendationCandidate {
  readonly id: string;
}

describe('shouldAutoPresentOnboarding', () => {
  it('auto-presents when no onboarding decision has been persisted', () => {
    expect(shouldAutoPresentOnboarding(null)).toBe(true);
  });

  it.each(['accepted', 'dismissed'] as const)(
    'does not auto-present after an %s decision',
    (decision) => {
      expect(shouldAutoPresentOnboarding(decision)).toBe(false);
    },
  );
});

describe('selectAccessibleRecommendation', () => {
  it('selects the first candidate whose every required feature is accessible', () => {
    const candidates: readonly Candidate[] = [
      { id: 'analytics-starter', requiredFeatures: ['HOME', 'ANALYTICS'] },
      { id: 'query-starter', requiredFeatures: ['HOME', 'QUERY'] },
      { id: 'guide-starter', requiredFeatures: ['GUIDE'] },
    ];

    expect(selectAccessibleRecommendation(candidates, ['HOME', 'QUERY', 'GUIDE'])).toBe(
      candidates[1],
    );
  });

  it('treats a candidate with no required features as accessible', () => {
    const candidate: Candidate = { id: 'workspace-basics', requiredFeatures: [] };

    expect(selectAccessibleRecommendation([candidate], [])).toBe(candidate);
  });

  it('returns null when no accessible recommendation exists', () => {
    const candidates: readonly Candidate[] = [
      { id: 'admin-starter', requiredFeatures: ['ADMINISTRATION'] },
      { id: 'analytics-starter', requiredFeatures: ['ANALYTICS'] },
    ];

    expect(selectAccessibleRecommendation(candidates, ['HOME'])).toBeNull();
  });
});
