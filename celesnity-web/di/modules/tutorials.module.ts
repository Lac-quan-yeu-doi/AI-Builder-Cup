import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createAdvanceTutorialStepUseCase } from '@/src/application/use-cases/tutorials/advance-tutorial-step.use-case';
import { createCompleteTutorialRunUseCase } from '@/src/application/use-cases/tutorials/complete-tutorial-run.use-case';
import { createListTutorialCatalogUseCase } from '@/src/application/use-cases/tutorials/list-tutorial-catalog.use-case';
import { createOpenTutorialDetailUseCase } from '@/src/application/use-cases/tutorials/open-tutorial-detail.use-case';
import { createOpenTutorialWalkthroughUseCase } from '@/src/application/use-cases/tutorials/open-tutorial-walkthrough.use-case';
import { createPauseTutorialRunUseCase } from '@/src/application/use-cases/tutorials/pause-tutorial-run.use-case';
import { createRecordOnboardingDecisionUseCase } from '@/src/application/use-cases/tutorials/record-onboarding-decision.use-case';
import { createRepeatTutorialUseCase } from '@/src/application/use-cases/tutorials/repeat-tutorial.use-case';
import { createResolveOnboardingUseCase } from '@/src/application/use-cases/tutorials/resolve-onboarding.use-case';
import { createResumeTutorialRunUseCase } from '@/src/application/use-cases/tutorials/resume-tutorial-run.use-case';
import { createStartTutorialRunUseCase } from '@/src/application/use-cases/tutorials/start-tutorial-run.use-case';
import { FirebaseIdentitySessionRepository } from '@/src/infrastructure/auth/firebase-identity-session.repository';
import { CoreApiTutorialProgressRepository } from '@/src/infrastructure/repositories/core-api-tutorial-progress.repository';
import { CoreApiTutorialRepository } from '@/src/infrastructure/repositories/core-api-tutorial.repository';
import { CoreApiTutorialFeatureAccessService } from '@/src/infrastructure/services/core-api-tutorial-feature-access.service';
import { CoreApiWorkspaceContextService } from '@/src/infrastructure/services/core-api-workspace-context.service';
import { createAdvanceTutorialStepController } from '@/src/interface-adapters/controllers/tutorials/advance-tutorial-step.controller';
import { createCompleteTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/complete-tutorial-run.controller';
import { createListTutorialCatalogController } from '@/src/interface-adapters/controllers/tutorials/list-tutorial-catalog.controller';
import { createOpenTutorialDetailController } from '@/src/interface-adapters/controllers/tutorials/open-tutorial-detail.controller';
import { createOpenTutorialWalkthroughController } from '@/src/interface-adapters/controllers/tutorials/open-tutorial-walkthrough.controller';
import { createPauseTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/pause-tutorial-run.controller';
import { createRecordOnboardingDecisionController } from '@/src/interface-adapters/controllers/tutorials/record-onboarding-decision.controller';
import { createRepeatTutorialController } from '@/src/interface-adapters/controllers/tutorials/repeat-tutorial.controller';
import { createResolveOnboardingController } from '@/src/interface-adapters/controllers/tutorials/resolve-onboarding.controller';
import { createResumeTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/resume-tutorial-run.controller';
import { createStartTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/start-tutorial-run.controller';

export function createTutorialsModule() {
  const tutorialsModule = createTypedModule();

  tutorialsModule
    .bind(DI_SYMBOLS.TutorialRepository)
    .toClass(CoreApiTutorialRepository, [DI_SYMBOLS.CoreApiClient]);
  tutorialsModule
    .bind(DI_SYMBOLS.TutorialProgressRepository)
    .toClass(CoreApiTutorialProgressRepository, [DI_SYMBOLS.CoreApiClient]);
  tutorialsModule
    .bind(DI_SYMBOLS.TutorialFeatureAccessService)
    .toClass(CoreApiTutorialFeatureAccessService, [DI_SYMBOLS.CoreApiClient]);
  tutorialsModule
    .bind(DI_SYMBOLS.WorkspaceContextService)
    .toClass(CoreApiWorkspaceContextService, [DI_SYMBOLS.CoreApiClient]);

  tutorialsModule
    .bind(DI_SYMBOLS.ListTutorialCatalogUseCase)
    .toHigherOrderFunction(createListTutorialCatalogUseCase, [
      DI_SYMBOLS.TutorialRepository,
      DI_SYMBOLS.TutorialProgressRepository,
    ]);
  tutorialsModule
    .bind(DI_SYMBOLS.OpenTutorialDetailUseCase)
    .toHigherOrderFunction(createOpenTutorialDetailUseCase, [
      DI_SYMBOLS.TutorialRepository,
      DI_SYMBOLS.TutorialFeatureAccessService,
      DI_SYMBOLS.WorkspaceContextService,
      DI_SYMBOLS.TutorialProgressRepository,
    ]);
  tutorialsModule
    .bind(DI_SYMBOLS.OpenTutorialWalkthroughUseCase)
    .toHigherOrderFunction(createOpenTutorialWalkthroughUseCase, [DI_SYMBOLS.TutorialRepository]);
  tutorialsModule.bind(DI_SYMBOLS.StartTutorialRunUseCase).toFactory((resolve) =>
    createStartTutorialRunUseCase({
      tutorialRepository: resolve(DI_SYMBOLS.TutorialRepository),
      progressRepository: resolve(DI_SYMBOLS.TutorialProgressRepository),
    }),
  );
  tutorialsModule.bind(DI_SYMBOLS.AdvanceTutorialStepUseCase).toFactory((resolve) =>
    createAdvanceTutorialStepUseCase({
      tutorialRepository: resolve(DI_SYMBOLS.TutorialRepository),
      progressRepository: resolve(DI_SYMBOLS.TutorialProgressRepository),
    }),
  );
  tutorialsModule.bind(DI_SYMBOLS.PauseTutorialRunUseCase).toFactory((resolve) =>
    createPauseTutorialRunUseCase({
      progressRepository: resolve(DI_SYMBOLS.TutorialProgressRepository),
      identitySessionRepository: new FirebaseIdentitySessionRepository(),
    }),
  );
  tutorialsModule.bind(DI_SYMBOLS.ResumeTutorialRunUseCase).toFactory((resolve) =>
    createResumeTutorialRunUseCase({
      tutorialRepository: resolve(DI_SYMBOLS.TutorialRepository),
      progressRepository: resolve(DI_SYMBOLS.TutorialProgressRepository),
      featureAccessService: resolve(DI_SYMBOLS.TutorialFeatureAccessService),
      workspaceContextService: resolve(DI_SYMBOLS.WorkspaceContextService),
    }),
  );
  tutorialsModule.bind(DI_SYMBOLS.CompleteTutorialRunUseCase).toFactory((resolve) =>
    createCompleteTutorialRunUseCase({
      progressRepository: resolve(DI_SYMBOLS.TutorialProgressRepository),
    }),
  );
  tutorialsModule.bind(DI_SYMBOLS.RepeatTutorialUseCase).toFactory((resolve) =>
    createRepeatTutorialUseCase({
      tutorialRepository: resolve(DI_SYMBOLS.TutorialRepository),
      progressRepository: resolve(DI_SYMBOLS.TutorialProgressRepository),
    }),
  );
  tutorialsModule.bind(DI_SYMBOLS.ResolveOnboardingUseCase).toFactory((resolve) =>
    createResolveOnboardingUseCase({
      tutorialRepository: resolve(DI_SYMBOLS.TutorialRepository),
      progressRepository: resolve(DI_SYMBOLS.TutorialProgressRepository),
      featureAccessService: resolve(DI_SYMBOLS.TutorialFeatureAccessService),
    }),
  );
  tutorialsModule
    .bind(DI_SYMBOLS.RecordOnboardingDecisionUseCase)
    .toHigherOrderFunction(createRecordOnboardingDecisionUseCase, [
      DI_SYMBOLS.TutorialProgressRepository,
    ]);

  tutorialsModule
    .bind(DI_SYMBOLS.ListTutorialCatalogController)
    .toHigherOrderFunction(createListTutorialCatalogController, [
      DI_SYMBOLS.ListTutorialCatalogUseCase,
    ]);
  tutorialsModule
    .bind(DI_SYMBOLS.OpenTutorialDetailController)
    .toHigherOrderFunction(createOpenTutorialDetailController, [
      DI_SYMBOLS.OpenTutorialDetailUseCase,
    ]);
  tutorialsModule
    .bind(DI_SYMBOLS.OpenTutorialWalkthroughController)
    .toHigherOrderFunction(createOpenTutorialWalkthroughController, [
      DI_SYMBOLS.OpenTutorialWalkthroughUseCase,
    ]);
  tutorialsModule
    .bind(DI_SYMBOLS.StartTutorialRunController)
    .toHigherOrderFunction(createStartTutorialRunController, [DI_SYMBOLS.StartTutorialRunUseCase]);
  tutorialsModule
    .bind(DI_SYMBOLS.AdvanceTutorialStepController)
    .toHigherOrderFunction(createAdvanceTutorialStepController, [
      DI_SYMBOLS.AdvanceTutorialStepUseCase,
    ]);
  tutorialsModule
    .bind(DI_SYMBOLS.PauseTutorialRunController)
    .toHigherOrderFunction(createPauseTutorialRunController, [DI_SYMBOLS.PauseTutorialRunUseCase]);
  tutorialsModule
    .bind(DI_SYMBOLS.ResumeTutorialRunController)
    .toHigherOrderFunction(createResumeTutorialRunController, [
      DI_SYMBOLS.ResumeTutorialRunUseCase,
    ]);
  tutorialsModule
    .bind(DI_SYMBOLS.CompleteTutorialRunController)
    .toHigherOrderFunction(createCompleteTutorialRunController, [
      DI_SYMBOLS.CompleteTutorialRunUseCase,
    ]);
  tutorialsModule
    .bind(DI_SYMBOLS.RepeatTutorialController)
    .toHigherOrderFunction(createRepeatTutorialController, [DI_SYMBOLS.RepeatTutorialUseCase]);
  tutorialsModule
    .bind(DI_SYMBOLS.ResolveOnboardingController)
    .toHigherOrderFunction(createResolveOnboardingController, [
      DI_SYMBOLS.ResolveOnboardingUseCase,
    ]);
  tutorialsModule
    .bind(DI_SYMBOLS.RecordOnboardingDecisionController)
    .toHigherOrderFunction(createRecordOnboardingDecisionController, [
      DI_SYMBOLS.RecordOnboardingDecisionUseCase,
    ]);

  return tutorialsModule;
}
