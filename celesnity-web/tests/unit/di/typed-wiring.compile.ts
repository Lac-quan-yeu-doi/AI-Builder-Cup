import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS, type DI_RETURN_TYPES } from '@/di/types';
import { createGetConnectionUseCase } from '@/src/application/use-cases/connections/get-connection.use-case';
import { createMonitorExecutionUseCase } from '@/src/application/use-cases/executions/monitor-execution.use-case';
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
import { CoreApiCatalogRepository } from '@/src/infrastructure/repositories/core-api-catalog.repository';

function proveInvalidBindingsFailToCompile(): void {
  const compileModule = createTypedModule();
  const bindListConnections = compileModule.bind(DI_SYMBOLS.ListConnectionsUseCase);
  const bindMonitorExecution = compileModule.bind(DI_SYMBOLS.MonitorExecutionUseCase);
  const bindConnectionRepository = compileModule.bind(DI_SYMBOLS.ConnectionRepository);

  // @ts-expect-error A catalog repository class cannot satisfy the connection repository binding.
  bindConnectionRepository.toClass(CoreApiCatalogRepository, [DI_SYMBOLS.CoreApiClient]);

  // @ts-expect-error A get-one factory cannot be bound as the list controller's use case.
  bindListConnections.toHigherOrderFunction(createGetConnectionUseCase, [
    DI_SYMBOLS.ConnectionRepository,
  ]);

  bindMonitorExecution.toHigherOrderFunction(createMonitorExecutionUseCase, [
    // @ts-expect-error The progress service cannot occupy the repository position.
    DI_SYMBOLS.ExecutionProgressService,
    // @ts-expect-error The repository cannot occupy the progress service position.
    DI_SYMBOLS.ExecutionRepository,
    DI_SYMBOLS.SchedulerService,
  ]);
}

type Equal<TLeft, TRight> =
  (<TValue>() => TValue extends TLeft ? 1 : 2) extends <TValue>() => TValue extends TRight ? 1 : 2
    ? (<TValue>() => TValue extends TRight ? 1 : 2) extends <TValue>() => TValue extends TLeft
        ? 1
        : 2
      ? true
      : false
    : false;

type Assert<TValue extends true> = TValue;

type TutorialControllerReturnTypeAssertions = {
  readonly ListTutorialCatalogController: Assert<
    Equal<
      DI_RETURN_TYPES['ListTutorialCatalogController'],
      ReturnType<typeof createListTutorialCatalogController>
    >
  >;
  readonly OpenTutorialDetailController: Assert<
    Equal<
      DI_RETURN_TYPES['OpenTutorialDetailController'],
      ReturnType<typeof createOpenTutorialDetailController>
    >
  >;
  readonly OpenTutorialWalkthroughController: Assert<
    Equal<
      DI_RETURN_TYPES['OpenTutorialWalkthroughController'],
      ReturnType<typeof createOpenTutorialWalkthroughController>
    >
  >;
  readonly StartTutorialRunController: Assert<
    Equal<
      DI_RETURN_TYPES['StartTutorialRunController'],
      ReturnType<typeof createStartTutorialRunController>
    >
  >;
  readonly AdvanceTutorialStepController: Assert<
    Equal<
      DI_RETURN_TYPES['AdvanceTutorialStepController'],
      ReturnType<typeof createAdvanceTutorialStepController>
    >
  >;
  readonly PauseTutorialRunController: Assert<
    Equal<
      DI_RETURN_TYPES['PauseTutorialRunController'],
      ReturnType<typeof createPauseTutorialRunController>
    >
  >;
  readonly ResumeTutorialRunController: Assert<
    Equal<
      DI_RETURN_TYPES['ResumeTutorialRunController'],
      ReturnType<typeof createResumeTutorialRunController>
    >
  >;
  readonly CompleteTutorialRunController: Assert<
    Equal<
      DI_RETURN_TYPES['CompleteTutorialRunController'],
      ReturnType<typeof createCompleteTutorialRunController>
    >
  >;
  readonly RepeatTutorialController: Assert<
    Equal<
      DI_RETURN_TYPES['RepeatTutorialController'],
      ReturnType<typeof createRepeatTutorialController>
    >
  >;
  readonly ResolveOnboardingController: Assert<
    Equal<
      DI_RETURN_TYPES['ResolveOnboardingController'],
      ReturnType<typeof createResolveOnboardingController>
    >
  >;
  readonly RecordOnboardingDecisionController: Assert<
    Equal<
      DI_RETURN_TYPES['RecordOnboardingDecisionController'],
      ReturnType<typeof createRecordOnboardingDecisionController>
    >
  >;
};

// **Validates: Requirements 2.2, 5.1, 12.1, 12.2, 12.8**
const tutorialControllerReturnTypesMatchDeclaredMap: TutorialControllerReturnTypeAssertions = {
  ListTutorialCatalogController: true,
  OpenTutorialDetailController: true,
  OpenTutorialWalkthroughController: true,
  StartTutorialRunController: true,
  AdvanceTutorialStepController: true,
  PauseTutorialRunController: true,
  ResumeTutorialRunController: true,
  CompleteTutorialRunController: true,
  RepeatTutorialController: true,
  ResolveOnboardingController: true,
  RecordOnboardingDecisionController: true,
};

function proveEveryTutorialTokenRejectsAnInvalidBinding(): void {
  const compileModule = createTypedModule();
  const invalidTutorialBinding = () => 0;

  // Every tutorial token rejects a factory with the wrong return type.
  compileModule.bind(DI_SYMBOLS.TutorialRepository).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the tutorial repository token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.TutorialProgressRepository).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the tutorial progress repository token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.TutorialFeatureAccessService).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the tutorial feature-access service token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.WorkspaceContextService).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the workspace-context service token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.ListTutorialCatalogUseCase).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the list-catalog use-case token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.OpenTutorialDetailUseCase).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the open-detail use-case token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.StartTutorialRunUseCase).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the start-run use-case token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.AdvanceTutorialStepUseCase).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the advance-step use-case token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.PauseTutorialRunUseCase).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the pause-run use-case token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.ResumeTutorialRunUseCase).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the resume-run use-case token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.CompleteTutorialRunUseCase).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the complete-run use-case token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.RepeatTutorialUseCase).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the repeat-tutorial use-case token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.ResolveOnboardingUseCase).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the resolve-onboarding use-case token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.RecordOnboardingDecisionUseCase).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the onboarding-decision use-case token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.ListTutorialCatalogController).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the list-catalog controller token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.OpenTutorialDetailController).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the open-detail controller token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.StartTutorialRunController).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the start-run controller token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.AdvanceTutorialStepController).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the advance-step controller token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.PauseTutorialRunController).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the pause-run controller token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.ResumeTutorialRunController).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the resume-run controller token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.CompleteTutorialRunController).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the complete-run controller token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.RepeatTutorialController).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the repeat-tutorial controller token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.ResolveOnboardingController).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the resolve-onboarding controller token.
    invalidTutorialBinding,
  );
  compileModule.bind(DI_SYMBOLS.RecordOnboardingDecisionController).toHigherOrderFunction(
    // @ts-expect-error A number factory cannot satisfy the onboarding-decision controller token.
    invalidTutorialBinding,
  );
}

void tutorialControllerReturnTypesMatchDeclaredMap;
void proveInvalidBindingsFailToCompile;
void proveEveryTutorialTokenRejectsAnInvalidBinding;
