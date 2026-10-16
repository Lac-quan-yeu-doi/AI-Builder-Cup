import { describe, expect, it, vi } from 'vitest';

import {
  createRecordOnboardingDecisionUseCase,
  onboardingDecisionPersistenceFailureExplanation,
} from '@/src/application/use-cases/tutorials/record-onboarding-decision.use-case';

const rawFailureMessage = 'SQLSTATE 08006 at onboarding_decisions shard-7';

const failureCases = [
  {
    action: 'acceptance',
    input: { decision: 'accepted', tutorialId: 'query-starter' },
    persistedDecision: 'accepted',
  },
  {
    action: 'dismissal',
    input: { decision: 'dismissed' },
    persistedDecision: 'dismissed',
  },
] as const;

describe('record onboarding decision persistence failure', () => {
  it.each(failureCases)(
    'keeps the invitation open with a safe explanation after $action cannot be saved',
    async ({ input, persistedDecision }) => {
      const saveOnboardingDecision = vi.fn(async () => {
        throw new Error(rawFailureMessage);
      });
      const recordDecision = createRecordOnboardingDecisionUseCase({
        saveOnboardingDecision,
      });

      const result = await recordDecision(input);

      expect(saveOnboardingDecision).toHaveBeenCalledOnce();
      expect(saveOnboardingDecision).toHaveBeenCalledWith(persistedDecision);
      expect(result).toEqual({
        outcome: 'PERSISTENCE_FAILED',
        invitationVisible: true,
        failureExplanation: onboardingDecisionPersistenceFailureExplanation,
      });
      expect(JSON.stringify(result)).not.toContain(rawFailureMessage);
    },
  );
});
