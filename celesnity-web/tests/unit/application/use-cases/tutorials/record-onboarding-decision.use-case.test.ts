import { describe, expect, it, vi } from 'vitest';

import { createRecordOnboardingDecisionUseCase } from '@/src/application/use-cases/tutorials/record-onboarding-decision.use-case';
import type { OnboardingDecision } from '@/src/entities/models/onboarding';

describe('record onboarding decision use case', () => {
  it('opens the selected tutorial detail after persisting acceptance', async () => {
    const saveOnboardingDecision = vi.fn(
      async (decision: OnboardingDecision): Promise<OnboardingDecision> => decision,
    );
    const recordDecision = createRecordOnboardingDecisionUseCase({
      saveOnboardingDecision,
    });

    await expect(
      recordDecision({ decision: 'accepted', tutorialId: 'query-starter' }),
    ).resolves.toEqual({
      outcome: 'OPEN_TUTORIAL_DETAIL',
      invitationVisible: false,
      tutorialId: 'query-starter',
    });
    expect(saveOnboardingDecision).toHaveBeenCalledOnce();
    expect(saveOnboardingDecision).toHaveBeenCalledWith('accepted');
  });

  it('closes the invitation after persisting dismissal', async () => {
    const saveOnboardingDecision = vi.fn(
      async (decision: OnboardingDecision): Promise<OnboardingDecision> => decision,
    );
    const recordDecision = createRecordOnboardingDecisionUseCase({
      saveOnboardingDecision,
    });

    await expect(recordDecision({ decision: 'dismissed' })).resolves.toEqual({
      outcome: 'INVITATION_CLOSED',
      invitationVisible: false,
    });
    expect(saveOnboardingDecision).toHaveBeenCalledOnce();
    expect(saveOnboardingDecision).toHaveBeenCalledWith('dismissed');
  });
});
