import type { ResolveOnboardingUseCase } from '@/src/application/use-cases/tutorials/resolve-onboarding.use-case';
import {
  presentResolvedOnboarding,
  type ResolvedOnboardingViewModel,
} from '@/src/interface-adapters/presenters/onboarding.presenter';

export type ResolveOnboardingController = ReturnType<typeof createResolveOnboardingController>;

export const createResolveOnboardingController =
  (useCase: ResolveOnboardingUseCase): (() => Promise<ResolvedOnboardingViewModel>) =>
  async () =>
    presentResolvedOnboarding(await useCase());
