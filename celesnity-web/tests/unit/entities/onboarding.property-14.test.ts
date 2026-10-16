import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  shouldAutoPresentOnboarding,
  type OnboardingDecision,
} from '@/src/entities/models/onboarding';

const persistedDecisionArbitrary: fc.Arbitrary<OnboardingDecision | null> = fc.constantFrom(
  null,
  'accepted',
  'dismissed',
);

describe('shouldAutoPresentOnboarding Property 14', () => {
  // Feature: guided-user-tutorials, Property 14: Onboarding auto-visibility follows the persisted decision
  // **Validates: Requirements 4.1, 4.10**
  it('auto-presents if and only if no onboarding decision is persisted', () => {
    fc.assert(
      fc.property(persistedDecisionArbitrary, (persistedDecision) => {
        expect(shouldAutoPresentOnboarding(persistedDecision)).toBe(persistedDecision === null);
      }),
      { numRuns: 100 },
    );
  });
});
