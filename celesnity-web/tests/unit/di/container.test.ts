import { describe, expect, it } from 'vitest';
import type { DependencyKey, Module } from '@evyweb/ioctopus';

import { getInjection } from '@/di/container';
import { createCatalogModule } from '@/di/modules/catalog.module';
import { createConnectionsModule } from '@/di/modules/connections.module';
import { createExecutionsModule } from '@/di/modules/executions.module';
import { createDevicesModule } from '@/di/modules/devices.module';
import { createPipelinesModule } from '@/di/modules/pipelines.module';
import { createPlatformModule } from '@/di/modules/platform.module';
import { createPlantModelModule } from '@/di/modules/plant-model.module';
import { createQueriesModule } from '@/di/modules/queries.module';
import { createScriptsModule } from '@/di/modules/scripts.module';
import { createSkillsModule } from '@/di/modules/skills.module';
import { createStreamingModule } from '@/di/modules/streaming.module';
import { createTutorialsModule } from '@/di/modules/tutorials.module';
import { DI_SYMBOLS } from '@/di/types';
import { AgentApiSkillRepository } from '@/src/infrastructure/repositories/agent-api-skill.repository';
import { CoreApiClient } from '@/src/infrastructure/api/core-api-client';
import { CoreApiCatalogRepository } from '@/src/infrastructure/repositories/core-api-catalog.repository';
import { CoreApiConnectionRepository } from '@/src/infrastructure/repositories/core-api-connection.repository';
import { CoreApiExecutionRepository } from '@/src/infrastructure/repositories/core-api-execution.repository';
import { CoreApiDeviceRepository } from '@/src/infrastructure/repositories/core-api-device.repository';
import { CoreApiDashboardRepository } from '@/src/infrastructure/repositories/core-api-dashboard.repository';
import { CoreApiNodeCatalogRepository } from '@/src/infrastructure/repositories/core-api-node-catalog.repository';
import { CoreApiPipelineRepository } from '@/src/infrastructure/repositories/core-api-pipeline.repository';
import { CoreApiPlantModelRepository } from '@/src/infrastructure/repositories/core-api-plant-model.repository';
import { CoreApiQueryRepository } from '@/src/infrastructure/repositories/core-api-query.repository';
import { CoreApiScriptRepository } from '@/src/infrastructure/repositories/core-api-script.repository';
import { CoreApiStreamingRepository } from '@/src/infrastructure/repositories/core-api-streaming.repository';
import { CoreApiTutorialProgressRepository } from '@/src/infrastructure/repositories/core-api-tutorial-progress.repository';
import { CoreApiTutorialRepository } from '@/src/infrastructure/repositories/core-api-tutorial.repository';
import { CoreApiTutorialFeatureAccessService } from '@/src/infrastructure/services/core-api-tutorial-feature-access.service';
import { CoreApiWorkspaceContextService } from '@/src/infrastructure/services/core-api-workspace-context.service';

const PLATFORM_KEYS = [
  'CoreApiClient',
  'AgentApiClient',
  'SchedulerService',
  'ExecutionProgressService',
  'QueryProgressService',
] as const;

const ADMINISTRATION_KEYS = [
  'AuthController',
  'AdministrationRepository',
  'LoadAdministrationSessionUseCase',
  'LoadAdministrationSessionController',
  'LoadAdministrationGovernanceUseCase',
  'InviteMemberUseCase',
  'UpdateMemberUseCase',
  'EnableOrganizationMfaUseCase',
  'EnableOrganizationMfaController',
  'RemoveAccountUseCase',
  'CreateAuthorizationGroupUseCase',
  'AddAuthorizationGroupMemberUseCase',
  'RemoveAuthorizationGroupMemberUseCase',
  'UpdateAuthorizationGroupFeaturesUseCase',
  'CreateCatalogGrantUseCase',
  'DeleteCatalogGrantUseCase',
  'ListServiceIdentitiesUseCase',
  'UpdateAgentServiceIdentityUseCase',
  'LoadAdministrationGovernanceController',
  'InviteMemberController',
  'UpdateMemberController',
  'RemoveAccountController',
  'CreateAuthorizationGroupController',
  'AddAuthorizationGroupMemberController',
  'RemoveAuthorizationGroupMemberController',
  'UpdateAuthorizationGroupFeaturesController',
  'CreateCatalogGrantController',
  'DeleteCatalogGrantController',
  'ListServiceIdentitiesController',
  'UpdateAgentServiceIdentityController',
] as const;

const REPOSITORY_KEYS = [
  'DatabaseServiceRepository',
  'ConnectionRepository',
  'CatalogRepository',
  'ScriptRepository',
  'ExecutionRepository',
  'QueryRepository',
  'PipelineRepository',
  'NodeCatalogRepository',
  'StreamingRepository',
  'DeviceRepository',
  'MetadataCrawlerRepository',
  'SourceMetadataRepository',
  'ChatRepository',
] as const;

const DATABASE_SERVICE_USE_CASE_KEYS = [
  'ListDatabaseServicesUseCase',
  'ListDatabaseServiceConnectorsUseCase',
  'GetDatabaseServiceUseCase',
  'TestUnsavedDatabaseServiceUseCase',
  'TestSavedDatabaseServiceUseCase',
  'CreateDatabaseServiceUseCase',
  'UpdateDatabaseServiceUseCase',
  'ArchiveDatabaseServiceUseCase',
  'ListAvailableDatabaseServicesUseCase',
  'AttachDatabaseServiceUseCase',
  'DetachDatabaseServiceUseCase',
  'CdcConnectionProfileUseCases',
] as const;

const USE_CASE_KEYS = [
  ...DATABASE_SERVICE_USE_CASE_KEYS,
  'ListConnectionsUseCase',
  'GetConnectionUseCase',
  'TestUnsavedConnectionUseCase',
  'TestSavedConnectionUseCase',
  'CreateConnectionUseCase',
  'UpdateConnectionUseCase',
  'ArchiveConnectionUseCase',
  'ListCatalogsUseCase',
  'CreateNamespaceUseCase',
  'UpdateNamespaceDescriptionUseCase',
  'ListNamespacesUseCase',
  'ListTablesUseCase',
  'LoadTableMetadataUseCase',
  'ListTableSnapshotsUseCase',
  'PreviewTableUseCase',
  'MonitorTablePreviewUseCase',
  'ListScriptsUseCase',
  'GetScriptUseCase',
  'ListScriptVersionsUseCase',
  'LoadScriptVersionSourceUseCase',
  'ListActiveConnectionsUseCase',
  'SaveScriptUseCase',
  'SaveAndRunScriptUseCase',
  'ListExecutionsUseCase',
  'GetExecutionUseCase',
  'CancelExecutionUseCase',
  'GetExecutionLogsUseCase',
  'RerunExecutionUseCase',
  'MonitorExecutionUseCase',
  'ListQueryCatalogsUseCase',
  'ListQueryNamespacesUseCase',
  'ListQueryHistoryUseCase',
  'GetQueryUseCase',
  'CancelQueryUseCase',
  'SubmitQueryUseCase',
  'MonitorQueryUseCase',
  'ListPipelinesUseCase',
  'GetPipelineUseCase',
  'GetOrCompilePipelineScriptUseCase',
  'CreatePipelineUseCase',
  'SavePipelineUseCase',
  'ClonePipelineUseCase',
  'ArchivePipelineUseCase',
  'ValidatePipelineGraphUseCase',
  'ValidatePipelineEdgeUseCase',
  'PreviewPipelineNodeUseCase',
  'RunPipelineUseCase',
  'LoadNodePaletteUseCase',
  'GetNodeDefinitionUseCase',
  'ManageStreamAdaptersUseCase',
  'ListDeviceAdaptersUseCase',
  'ListDevicesUseCase',
  'RegisterDeviceUseCase',
  'ActivateDeviceUseCase',
  'SuspendDeviceUseCase',
  'RotateDeviceCredentialUseCase',
  'RetireDeviceUseCase',
  'TransitionDeviceLifecycleUseCase',
  'ListDeviceLifecycleUseCase',
  'ReplaceDeviceUseCase',
  'CreateFirmwareReleaseUseCase',
  'ListFirmwareReleasesUseCase',
  'ListFirmwareDeploymentsUseCase',
  'StartFirmwareDeploymentUseCase',
  'CreateFirmwareCampaignUseCase',
  'ListFirmwareCampaignsUseCase',
  'TransitionFirmwareCampaignUseCase',
  'ListDeviceAlertsUseCase',
  'ListDeviceLogsUseCase',
  'AcknowledgeDeviceAlertUseCase',
  'ClearDeviceAlertUseCase',
  'ListDeviceConfigurationsUseCase',
  'PushDeviceConfigurationUseCase',
  'CreateDeviceConfigurationTemplateUseCase',
  'ListDeviceConfigurationTemplatesUseCase',
  'DeployDeviceConfigurationTemplateUseCase',
  'MetadataCrawlerUseCases',
  'SourceMetadataUseCases',
  'ManageChatUseCase',
] as const;

const DATABASE_SERVICE_CONTROLLER_KEYS = [
  'ListDatabaseServicesController',
  'ListDatabaseServiceConnectorsController',
  'GetDatabaseServiceController',
  'TestUnsavedDatabaseServiceController',
  'TestSavedDatabaseServiceController',
  'CreateDatabaseServiceController',
  'UpdateDatabaseServiceController',
  'ArchiveDatabaseServiceController',
  'ListAvailableDatabaseServicesController',
  'AttachDatabaseServiceController',
  'DetachDatabaseServiceController',
  'CdcConnectionProfileController',
] as const;

const UI_CONTROLLER_KEYS = [
  ...DATABASE_SERVICE_CONTROLLER_KEYS,
  'ListConnectionsController',
  'GetConnectionController',
  'TestUnsavedConnectionController',
  'TestSavedConnectionController',
  'CreateConnectionController',
  'UpdateConnectionController',
  'ArchiveConnectionController',
  'ListCatalogsController',
  'CreateNamespaceController',
  'UpdateNamespaceDescriptionController',
  'ListNamespacesController',
  'ListTablesController',
  'LoadTableMetadataController',
  'ListTableSnapshotsController',
  'PreviewTableController',
  'MonitorTablePreviewController',
  'ListScriptsController',
  'GetScriptController',
  'ListScriptVersionsController',
  'LoadScriptVersionSourceController',
  'ListActiveConnectionsController',
  'SaveScriptController',
  'SaveAndRunScriptController',
  'ListExecutionsController',
  'GetExecutionController',
  'CancelExecutionController',
  'GetExecutionLogsController',
  'RerunExecutionController',
  'MonitorExecutionController',
  'ListQueryCatalogsController',
  'ListQueryNamespacesController',
  'ListQueryHistoryController',
  'GetQueryController',
  'CancelQueryController',
  'SubmitQueryController',
  'MonitorQueryController',
  'ListPipelinesController',
  'GetPipelineController',
  'GetPipelineScriptController',
  'CreatePipelineController',
  'SavePipelineController',
  'ClonePipelineController',
  'ArchivePipelineController',
  'ValidatePipelineGraphController',
  'ValidatePipelineEdgeController',
  'PreviewPipelineNodeController',
  'RunPipelineController',
  'LoadNodePaletteController',
  'GetNodeDefinitionController',
  'ManageStreamAdaptersController',
  'ListDeviceAdaptersController',
  'ListDevicesController',
  'RegisterDeviceController',
  'ActivateDeviceController',
  'SuspendDeviceController',
  'RotateDeviceCredentialController',
  'RetireDeviceController',
  'TransitionDeviceLifecycleController',
  'ListDeviceLifecycleController',
  'ReplaceDeviceController',
  'CreateFirmwareReleaseController',
  'ListFirmwareReleasesController',
  'ListFirmwareDeploymentsController',
  'StartFirmwareDeploymentController',
  'CreateFirmwareCampaignController',
  'ListFirmwareCampaignsController',
  'TransitionFirmwareCampaignController',
  'ListDeviceAlertsController',
  'ListDeviceLogsController',
  'AcknowledgeDeviceAlertController',
  'ClearDeviceAlertController',
  'ListDeviceConfigurationsController',
  'PushDeviceConfigurationController',
  'CreateDeviceConfigurationTemplateController',
  'ListDeviceConfigurationTemplatesController',
  'DeployDeviceConfigurationTemplateController',
  'MetadataCrawlerController',
  'SourceMetadataController',
  'ManageChatController',
] as const;

const MESSAGE_BLOCK_KEYS = [
  'MessageBlockRepository',
  'MessageBlockProgressService',
  'ListMessageBlockHistoryUseCase',
  'SubscribeMessageBlocksUseCase',
  'ListMessageBlockHistoryController',
  'SubscribeMessageBlocksController',
] as const;

const CHART_KEYS = [
  'ChartRepository',
  'CanonicalChartRepository',
  'ChartCollectionRepository',
  'ChartCollectionUseCases',
  'ChartProgressService',
  'ChartRendererService',
  'ListChartsUseCase',
  'SubscribeChartsUseCase',
  'CreateChartUseCase',
  'PatchChartUseCase',
  'DeleteChartUseCase',
  'PreviewCanonicalChartQueryUseCase',
  'PreviewCanonicalChartUseCase',
  'CreateCanonicalChartUseCase',
  'GetCanonicalChartUseCase',
  'RunSavedCanonicalChartUseCase',
  'ListCanonicalChartsUseCase',
  'UpdateCanonicalChartUseCase',
  'ListCanonicalChartRevisionsUseCase',
  'RestoreCanonicalChartRevisionUseCase',
  'CancelCanonicalChartRunUseCase',
  'SaveAsNewCanonicalChartUseCase',
  'SaveChatChartPreviewUseCase',
  'CompileCanonicalChartQueryUseCase',
  'ListChartsController',
  'SubscribeChartsController',
  'CreateChartController',
  'PatchChartController',
  'DeleteChartController',
  'PreviewCanonicalChartQueryController',
  'PreviewCanonicalChartController',
  'CreateCanonicalChartController',
  'GetCanonicalChartController',
  'RunSavedCanonicalChartController',
  'ListCanonicalChartsController',
  'UpdateCanonicalChartController',
  'ListCanonicalChartRevisionsController',
  'RestoreCanonicalChartRevisionController',
  'CancelCanonicalChartRunController',
  'SaveAsNewCanonicalChartController',
  'SaveChatChartPreviewController',
  'CompileCanonicalChartQueryController',
  'ListChartCollectionsUseCase',
  'ListChartCollectionsController',
  'CreateChartCollectionController',
  'UpdateChartCollectionController',
  'MoveChartCollectionController',
  'ArchiveChartCollectionController',
] as const;

const DASHBOARD_KEYS = [
  'DashboardRepository',
  'DashboardRuntimeService',
  'CreateDashboardUseCase',
  'GetDashboardUseCase',
  'ListDashboardsUseCase',
  'SaveDashboardUseCase',
  'CopyDashboardUseCase',
  'ArchiveDashboardUseCase',
  'ExecuteDashboardUseCase',
  'ListDashboardFilterTargetsUseCase',
  'CreateDashboardController',
  'GetDashboardController',
  'ListDashboardsController',
  'SaveDashboardController',
  'CopyDashboardController',
  'ArchiveDashboardController',
  'ExecuteDashboardController',
  'ListDashboardFilterTargetsController',
] as const;

const PLANT_MODEL_KEYS = [
  'PlantModelRepository',
  'PlantModelUseCases',
  'PlantModelController',
] as const;

const MERGED_FEATURE_KEYS = [
  'ChartEncodingSuggestionRepository',
  'SetChartDataFromCsvUseCase',
  'SuggestChartEncodingsUseCase',
  'SetChartDataFromCsvController',
  'SuggestChartEncodingsController',
  'PendingActionRepository',
  'ListPendingActionsUseCase',
  'GetPendingActionUseCase',
  'ApprovePendingActionUseCase',
  'RejectPendingActionUseCase',
  'ListPendingActionsController',
  'GetPendingActionController',
  'ApprovePendingActionController',
  'RejectPendingActionController',
  'ActionCatalogRepository',
  'ListActionCatalogUseCase',
  'ListActionCatalogController',
  'AgentManifestRepository',
  'ListAgentManifestsUseCase',
  'GetAgentManifestUseCase',
  'SaveAgentManifestUseCase',
  'ValidateAgentManifestUseCase',
  'DeleteAgentManifestUseCase',
  'ListAgentManifestsController',
  'GetAgentManifestController',
  'SaveAgentManifestController',
  'ValidateAgentManifestController',
  'DeleteAgentManifestController',
  'CitationRepository',
  'ResolveCitationsUseCase',
  'ResolveCitationsController',
  'DocumentRepository',
  'ListDocumentsUseCase',
  'UploadDocumentUseCase',
  'GetDocumentContentUseCase',
  'ListDocumentsController',
  'UploadDocumentController',
  'GetDocumentContentController',
  'AutomationWorkflowRepository',
  'AutomationWorkflowUseCases',
  'AutomationWorkflowController',
] as const;

const SKILLS_KEYS = [
  'SkillRepository',
  'ListSkillsUseCase',
  'GetSkillUseCase',
  'CreateSkillUseCase',
  'UpdateSkillUseCase',
  'DeleteSkillUseCase',
  'ListSkillsController',
  'GetSkillController',
  'CreateSkillController',
  'UpdateSkillController',
  'DeleteSkillController',
] as const;

const TUTORIAL_OBJECT_KEYS = [
  'TutorialRepository',
  'TutorialProgressRepository',
  'TutorialFeatureAccessService',
  'WorkspaceContextService',
] as const;

const TUTORIAL_CALLABLE_KEYS = [
  'ListTutorialCatalogUseCase',
  'OpenTutorialDetailUseCase',
  'OpenTutorialWalkthroughUseCase',
  'StartTutorialRunUseCase',
  'AdvanceTutorialStepUseCase',
  'PauseTutorialRunUseCase',
  'ResumeTutorialRunUseCase',
  'CompleteTutorialRunUseCase',
  'RepeatTutorialUseCase',
  'ResolveOnboardingUseCase',
  'RecordOnboardingDecisionUseCase',
  'ListTutorialCatalogController',
  'OpenTutorialDetailController',
  'OpenTutorialWalkthroughController',
  'StartTutorialRunController',
  'AdvanceTutorialStepController',
  'PauseTutorialRunController',
  'ResumeTutorialRunController',
  'CompleteTutorialRunController',
  'RepeatTutorialController',
  'ResolveOnboardingController',
  'RecordOnboardingDecisionController',
] as const;

const TUTORIAL_KEYS = [...TUTORIAL_OBJECT_KEYS, ...TUTORIAL_CALLABLE_KEYS] as const;

const ALL_KEYS = [
  ...ADMINISTRATION_KEYS,
  ...PLATFORM_KEYS,
  ...REPOSITORY_KEYS,
  ...USE_CASE_KEYS,
  ...UI_CONTROLLER_KEYS,
  ...MESSAGE_BLOCK_KEYS,
  ...CHART_KEYS,
  ...DASHBOARD_KEYS,
  ...PLANT_MODEL_KEYS,
  'DataWorkflowRepository',
  'DataWorkflowUseCases',
  'DataWorkflowController',
  ...MERGED_FEATURE_KEYS,
  ...SKILLS_KEYS,
  ...TUTORIAL_KEYS,
  'WorkspaceTreeRepository',
  'ListWorkspaceTreeUseCase',
  'GetWorkspaceFileContentUseCase',
  'ListWorkspaceTreeController',
  'GetWorkspaceFileContentController',
] as const;

const SKILL_BINDINGS = [
  [DI_SYMBOLS.SkillRepository, [DI_SYMBOLS.AgentApiClient]],
  [DI_SYMBOLS.ListSkillsUseCase, [DI_SYMBOLS.SkillRepository]],
  [DI_SYMBOLS.GetSkillUseCase, [DI_SYMBOLS.SkillRepository]],
  [DI_SYMBOLS.CreateSkillUseCase, [DI_SYMBOLS.SkillRepository]],
  [DI_SYMBOLS.UpdateSkillUseCase, [DI_SYMBOLS.SkillRepository]],
  [DI_SYMBOLS.DeleteSkillUseCase, [DI_SYMBOLS.SkillRepository]],
  [DI_SYMBOLS.ListSkillsController, [DI_SYMBOLS.ListSkillsUseCase]],
  [DI_SYMBOLS.GetSkillController, [DI_SYMBOLS.GetSkillUseCase]],
  [DI_SYMBOLS.CreateSkillController, [DI_SYMBOLS.CreateSkillUseCase]],
  [DI_SYMBOLS.UpdateSkillController, [DI_SYMBOLS.UpdateSkillUseCase]],
  [DI_SYMBOLS.DeleteSkillController, [DI_SYMBOLS.DeleteSkillUseCase]],
] as const satisfies readonly BindingExpectation[];

describe('application dependency injection container', () => {
  it('publishes the exhaustive stable symbol registry', () => {
    // Membership, not declaration order: what this guards is that no symbol
    // enters the registry without being recorded here, and the order modules
    // happen to be declared in is not part of that contract.
    expect([...Object.keys(DI_SYMBOLS)].sort()).toEqual([...ALL_KEYS].sort());

    for (const key of ALL_KEYS) {
      expect(Symbol.keyFor(DI_SYMBOLS[key])).toBe(`celesnity.${key}`);
    }
  });

  it('resolves the message-block controllers as singletons', () => {
    for (const key of [
      'ListMessageBlockHistoryController',
      'SubscribeMessageBlocksController',
    ] as const) {
      const first = getInjection(key);
      const second = getInjection(key);

      expect(first, key).toBeTypeOf('function');
      expect(second, key).toBe(first);
    }
  });

  it('resolves the canonical chart query compilation boundary', () => {
    const useCase = getInjection('CompileCanonicalChartQueryUseCase');
    const controller = getInjection('CompileCanonicalChartQueryController');

    expect(useCase).toBeTypeOf('function');
    expect(controller).toBeTypeOf('function');
    expect(getInjection('CompileCanonicalChartQueryUseCase')).toBe(useCase);
    expect(getInjection('CompileCanonicalChartQueryController')).toBe(controller);
  });

  it('resolves every UI-facing controller as a singleton', () => {
    for (const key of UI_CONTROLLER_KEYS) {
      const first = getInjection(key);
      const second = getInjection(key);

      if (key === 'MetadataCrawlerController') {
        expect(first, key).toMatchObject({
          list: expect.any(Function),
          runNow: expect.any(Function),
        });
      } else if (key === 'SourceMetadataController') {
        expect(first, key).toMatchObject({
          getSummary: expect.any(Function),
          listNamespaces: expect.any(Function),
        });
      } else if (key === 'CdcConnectionProfileController') {
        expect(first, key).toMatchObject({
          get: expect.any(Function),
          save: expect.any(Function),
          validate: expect.any(Function),
          remove: expect.any(Function),
        });
      } else {
        expect(first, key).toBeTypeOf('function');
      }
      expect(second, key).toBe(first);
    }
  });

  it('resolves the Skills repository, use cases, and controllers', () => {
    for (const key of SKILLS_KEYS) {
      const first = getInjection(key);
      const second = getInjection(key);

      if (key === 'SkillRepository') {
        expect(first, key).toBeInstanceOf(AgentApiSkillRepository);
      } else {
        expect(first, key).toBeTypeOf('function');
      }
      expect(second, key).toBe(first);
    }
  });

  // **Validates: Requirements 2.2, 5.1, 12.1, 12.2, 12.8**
  it('resolves every tutorial dependency as a singleton', () => {
    const objectBindings = [
      ['TutorialRepository', CoreApiTutorialRepository],
      ['TutorialProgressRepository', CoreApiTutorialProgressRepository],
      ['TutorialFeatureAccessService', CoreApiTutorialFeatureAccessService],
      ['WorkspaceContextService', CoreApiWorkspaceContextService],
    ] as const;

    for (const [key, Implementation] of objectBindings) {
      const first = getInjection(key);
      const second = getInjection(key);

      expect(first, key).toBeInstanceOf(Implementation);
      expect(second, key).toBe(first);
    }

    for (const key of TUTORIAL_CALLABLE_KEYS) {
      const first = getInjection(key);
      const second = getInjection(key);

      expect(first, key).toBeTypeOf('function');
      expect(second, key).toBe(first);
    }
  });

  it('routes every tutorial API collaborator through the shared Core client', () => {
    const coreApiClient = getInjection('CoreApiClient');

    for (const key of [
      'TutorialRepository',
      'TutorialProgressRepository',
      'WorkspaceContextService',
      'TutorialFeatureAccessService',
    ] as const) {
      expect(readInjectedTransport(getInjection(key)), key).toBe(coreApiClient);
    }
  });

  it('shares one transport across all feature repositories without issuing requests', () => {
    const transport = getInjection('CoreApiClient');
    const repositories = [
      [getInjection('ConnectionRepository'), CoreApiConnectionRepository],
      [getInjection('CatalogRepository'), CoreApiCatalogRepository],
      [getInjection('ScriptRepository'), CoreApiScriptRepository],
      [getInjection('ExecutionRepository'), CoreApiExecutionRepository],
      [getInjection('QueryRepository'), CoreApiQueryRepository],
      [getInjection('PipelineRepository'), CoreApiPipelineRepository],
      [getInjection('NodeCatalogRepository'), CoreApiNodeCatalogRepository],
      [getInjection('StreamingRepository'), CoreApiStreamingRepository],
      [getInjection('DeviceRepository'), CoreApiDeviceRepository],
      [getInjection('DashboardRepository'), CoreApiDashboardRepository],
      [getInjection('PlantModelRepository'), CoreApiPlantModelRepository],
    ] as const;

    expect(transport).toBeInstanceOf(CoreApiClient);
    for (const [repository, RepositoryClass] of repositories) {
      expect(repository).toBeInstanceOf(RepositoryClass);
      expect(readInjectedTransport(repository)).toBe(transport);
    }
  });

  it.each([
    ['platform', createPlatformModule, PLATFORM_BINDINGS],
    ['connections', createConnectionsModule, CONNECTION_BINDINGS],
    ['catalog', createCatalogModule, CATALOG_BINDINGS],
    ['scripts', createScriptsModule, SCRIPT_BINDINGS],
    ['executions', createExecutionsModule, EXECUTION_BINDINGS],
    ['queries', createQueriesModule, QUERY_BINDINGS],
    ['pipelines', createPipelinesModule, PIPELINE_BINDINGS],
    ['plant-model', createPlantModelModule, PLANT_MODEL_BINDINGS],
    ['streaming', createStreamingModule, STREAMING_BINDINGS],
    ['devices', createDevicesModule, DEVICE_BINDINGS],
    ['skills', createSkillsModule, SKILL_BINDINGS],
    ['tutorials', createTutorialsModule, TUTORIAL_BINDINGS],
  ] as const)('wires the %s module with the exact dependency order', (_name, create, expected) => {
    expectModuleBindings(create(), expected);
  });
});

function readInjectedTransport(repository: object): unknown {
  return (repository as unknown as { readonly transport: unknown }).transport;
}

type BindingExpectation = readonly [DependencyKey, readonly DependencyKey[]];

function expectModuleBindings(
  module: Pick<Module, 'bindings'>,
  expectations: readonly BindingExpectation[],
): void {
  expect([...module.bindings.keys()]).toEqual(expectations.map(([key]) => key));

  for (const [key, dependencies] of expectations) {
    const binding = module.bindings.get(key);
    expect(binding, key.toString()).toBeDefined();

    const resolutionOrder: DependencyKey[] = [];
    binding?.factory((dependency) => {
      resolutionOrder.push(dependency);
      return dependencySentinel(dependency);
    });

    expect(resolutionOrder, key.toString()).toEqual(dependencies);
  }
}

const dependencySentinels = new Map<DependencyKey, object>();

function dependencySentinel(key: DependencyKey): object {
  const existing = dependencySentinels.get(key);
  if (existing) {
    return existing;
  }

  const sentinel = Object.freeze({ key });
  dependencySentinels.set(key, sentinel);
  return sentinel;
}

const PLATFORM_BINDINGS = [
  [DI_SYMBOLS.CoreApiClient, []],
  [DI_SYMBOLS.AgentApiClient, []],
  [DI_SYMBOLS.SchedulerService, []],
  [DI_SYMBOLS.ExecutionProgressService, []],
  [DI_SYMBOLS.QueryProgressService, []],
] as const satisfies readonly BindingExpectation[];

const CONNECTION_BINDINGS = [
  [DI_SYMBOLS.ConnectionRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.ListConnectionsUseCase, [DI_SYMBOLS.ConnectionRepository]],
  [DI_SYMBOLS.GetConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]],
  [DI_SYMBOLS.TestUnsavedConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]],
  [DI_SYMBOLS.TestSavedConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]],
  [DI_SYMBOLS.CreateConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]],
  [DI_SYMBOLS.UpdateConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]],
  [DI_SYMBOLS.ArchiveConnectionUseCase, [DI_SYMBOLS.ConnectionRepository]],
  [DI_SYMBOLS.ListConnectionsController, [DI_SYMBOLS.ListConnectionsUseCase]],
  [DI_SYMBOLS.GetConnectionController, [DI_SYMBOLS.GetConnectionUseCase]],
  [DI_SYMBOLS.TestUnsavedConnectionController, [DI_SYMBOLS.TestUnsavedConnectionUseCase]],
  [DI_SYMBOLS.TestSavedConnectionController, [DI_SYMBOLS.TestSavedConnectionUseCase]],
  [DI_SYMBOLS.CreateConnectionController, [DI_SYMBOLS.CreateConnectionUseCase]],
  [DI_SYMBOLS.UpdateConnectionController, [DI_SYMBOLS.UpdateConnectionUseCase]],
  [DI_SYMBOLS.ArchiveConnectionController, [DI_SYMBOLS.ArchiveConnectionUseCase]],
] as const satisfies readonly BindingExpectation[];

const CATALOG_BINDINGS = [
  [DI_SYMBOLS.CatalogRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.ListCatalogsUseCase, [DI_SYMBOLS.CatalogRepository]],
  [DI_SYMBOLS.CreateNamespaceUseCase, [DI_SYMBOLS.CatalogRepository]],
  [DI_SYMBOLS.UpdateNamespaceDescriptionUseCase, [DI_SYMBOLS.CatalogRepository]],
  [DI_SYMBOLS.ListNamespacesUseCase, [DI_SYMBOLS.CatalogRepository]],
  [DI_SYMBOLS.ListTablesUseCase, [DI_SYMBOLS.CatalogRepository]],
  [DI_SYMBOLS.LoadTableMetadataUseCase, [DI_SYMBOLS.CatalogRepository]],
  [DI_SYMBOLS.ListTableSnapshotsUseCase, [DI_SYMBOLS.CatalogRepository]],
  [DI_SYMBOLS.PreviewTableUseCase, [DI_SYMBOLS.CatalogRepository]],
  [
    DI_SYMBOLS.MonitorTablePreviewUseCase,
    [DI_SYMBOLS.PreviewTableUseCase, DI_SYMBOLS.SchedulerService],
  ],
  [DI_SYMBOLS.ListCatalogsController, [DI_SYMBOLS.ListCatalogsUseCase]],
  [DI_SYMBOLS.CreateNamespaceController, [DI_SYMBOLS.CreateNamespaceUseCase]],
  [DI_SYMBOLS.UpdateNamespaceDescriptionController, [DI_SYMBOLS.UpdateNamespaceDescriptionUseCase]],
  [DI_SYMBOLS.ListNamespacesController, [DI_SYMBOLS.ListNamespacesUseCase]],
  [DI_SYMBOLS.ListTablesController, [DI_SYMBOLS.ListTablesUseCase]],
  [DI_SYMBOLS.LoadTableMetadataController, [DI_SYMBOLS.LoadTableMetadataUseCase]],
  [DI_SYMBOLS.ListTableSnapshotsController, [DI_SYMBOLS.ListTableSnapshotsUseCase]],
  [DI_SYMBOLS.PreviewTableController, [DI_SYMBOLS.PreviewTableUseCase]],
  [DI_SYMBOLS.MonitorTablePreviewController, [DI_SYMBOLS.MonitorTablePreviewUseCase]],
] as const satisfies readonly BindingExpectation[];

const SCRIPT_BINDINGS = [
  [DI_SYMBOLS.ScriptRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.ListScriptsUseCase, [DI_SYMBOLS.ScriptRepository]],
  [DI_SYMBOLS.GetScriptUseCase, [DI_SYMBOLS.ScriptRepository]],
  [DI_SYMBOLS.ListScriptVersionsUseCase, [DI_SYMBOLS.ScriptRepository]],
  [DI_SYMBOLS.LoadScriptVersionSourceUseCase, [DI_SYMBOLS.ScriptRepository]],
  [DI_SYMBOLS.ListActiveConnectionsUseCase, [DI_SYMBOLS.ScriptRepository]],
  [DI_SYMBOLS.SaveScriptUseCase, [DI_SYMBOLS.ScriptRepository]],
  [DI_SYMBOLS.SaveAndRunScriptUseCase, [DI_SYMBOLS.ScriptRepository]],
  [DI_SYMBOLS.ListScriptsController, [DI_SYMBOLS.ListScriptsUseCase]],
  [DI_SYMBOLS.GetScriptController, [DI_SYMBOLS.GetScriptUseCase]],
  [DI_SYMBOLS.ListScriptVersionsController, [DI_SYMBOLS.ListScriptVersionsUseCase]],
  [DI_SYMBOLS.LoadScriptVersionSourceController, [DI_SYMBOLS.LoadScriptVersionSourceUseCase]],
  [DI_SYMBOLS.ListActiveConnectionsController, [DI_SYMBOLS.ListActiveConnectionsUseCase]],
  [DI_SYMBOLS.SaveScriptController, [DI_SYMBOLS.SaveScriptUseCase]],
  [DI_SYMBOLS.SaveAndRunScriptController, [DI_SYMBOLS.SaveAndRunScriptUseCase]],
] as const satisfies readonly BindingExpectation[];

const EXECUTION_BINDINGS = [
  [DI_SYMBOLS.ExecutionRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.ListExecutionsUseCase, [DI_SYMBOLS.ExecutionRepository]],
  [DI_SYMBOLS.GetExecutionUseCase, [DI_SYMBOLS.ExecutionRepository]],
  [DI_SYMBOLS.CancelExecutionUseCase, [DI_SYMBOLS.ExecutionRepository]],
  [DI_SYMBOLS.GetExecutionLogsUseCase, [DI_SYMBOLS.ExecutionRepository]],
  [DI_SYMBOLS.RerunExecutionUseCase, [DI_SYMBOLS.ExecutionRepository]],
  [
    DI_SYMBOLS.MonitorExecutionUseCase,
    [
      DI_SYMBOLS.ExecutionRepository,
      DI_SYMBOLS.ExecutionProgressService,
      DI_SYMBOLS.SchedulerService,
    ],
  ],
  [DI_SYMBOLS.ListExecutionsController, [DI_SYMBOLS.ListExecutionsUseCase]],
  [DI_SYMBOLS.GetExecutionController, [DI_SYMBOLS.GetExecutionUseCase]],
  [DI_SYMBOLS.CancelExecutionController, [DI_SYMBOLS.CancelExecutionUseCase]],
  [DI_SYMBOLS.GetExecutionLogsController, [DI_SYMBOLS.GetExecutionLogsUseCase]],
  [DI_SYMBOLS.RerunExecutionController, [DI_SYMBOLS.RerunExecutionUseCase]],
  [DI_SYMBOLS.MonitorExecutionController, [DI_SYMBOLS.MonitorExecutionUseCase]],
] as const satisfies readonly BindingExpectation[];

const QUERY_BINDINGS = [
  [DI_SYMBOLS.QueryRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.ListQueryCatalogsUseCase, [DI_SYMBOLS.QueryRepository]],
  [DI_SYMBOLS.ListQueryNamespacesUseCase, [DI_SYMBOLS.QueryRepository]],
  [DI_SYMBOLS.ListQueryHistoryUseCase, [DI_SYMBOLS.QueryRepository]],
  [DI_SYMBOLS.GetQueryUseCase, [DI_SYMBOLS.QueryRepository]],
  [DI_SYMBOLS.CancelQueryUseCase, [DI_SYMBOLS.QueryRepository]],
  [DI_SYMBOLS.SubmitQueryUseCase, [DI_SYMBOLS.QueryRepository]],
  [
    DI_SYMBOLS.MonitorQueryUseCase,
    [DI_SYMBOLS.QueryRepository, DI_SYMBOLS.QueryProgressService, DI_SYMBOLS.SchedulerService],
  ],
  [DI_SYMBOLS.ListQueryCatalogsController, [DI_SYMBOLS.ListQueryCatalogsUseCase]],
  [DI_SYMBOLS.ListQueryNamespacesController, [DI_SYMBOLS.ListQueryNamespacesUseCase]],
  [DI_SYMBOLS.ListQueryHistoryController, [DI_SYMBOLS.ListQueryHistoryUseCase]],
  [DI_SYMBOLS.GetQueryController, [DI_SYMBOLS.GetQueryUseCase]],
  [DI_SYMBOLS.CancelQueryController, [DI_SYMBOLS.CancelQueryUseCase]],
  [DI_SYMBOLS.SubmitQueryController, [DI_SYMBOLS.SubmitQueryUseCase]],
  [DI_SYMBOLS.MonitorQueryController, [DI_SYMBOLS.MonitorQueryUseCase]],
] as const satisfies readonly BindingExpectation[];

const PIPELINE_BINDINGS = [
  [DI_SYMBOLS.PipelineRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.NodeCatalogRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.ListPipelinesUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.GetPipelineUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.GetOrCompilePipelineScriptUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.CreatePipelineUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.SavePipelineUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.ClonePipelineUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.ArchivePipelineUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.ValidatePipelineGraphUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.ValidatePipelineEdgeUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.PreviewPipelineNodeUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.RunPipelineUseCase, [DI_SYMBOLS.PipelineRepository]],
  [DI_SYMBOLS.LoadNodePaletteUseCase, [DI_SYMBOLS.NodeCatalogRepository]],
  [DI_SYMBOLS.GetNodeDefinitionUseCase, [DI_SYMBOLS.NodeCatalogRepository]],
  [DI_SYMBOLS.ListPipelinesController, [DI_SYMBOLS.ListPipelinesUseCase]],
  [DI_SYMBOLS.GetPipelineController, [DI_SYMBOLS.GetPipelineUseCase]],
  [DI_SYMBOLS.GetPipelineScriptController, [DI_SYMBOLS.GetOrCompilePipelineScriptUseCase]],
  [DI_SYMBOLS.CreatePipelineController, [DI_SYMBOLS.CreatePipelineUseCase]],
  [DI_SYMBOLS.SavePipelineController, [DI_SYMBOLS.SavePipelineUseCase]],
  [DI_SYMBOLS.ClonePipelineController, [DI_SYMBOLS.ClonePipelineUseCase]],
  [DI_SYMBOLS.ArchivePipelineController, [DI_SYMBOLS.ArchivePipelineUseCase]],
  [DI_SYMBOLS.ValidatePipelineGraphController, [DI_SYMBOLS.ValidatePipelineGraphUseCase]],
  [DI_SYMBOLS.ValidatePipelineEdgeController, [DI_SYMBOLS.ValidatePipelineEdgeUseCase]],
  [DI_SYMBOLS.PreviewPipelineNodeController, [DI_SYMBOLS.PreviewPipelineNodeUseCase]],
  [DI_SYMBOLS.RunPipelineController, [DI_SYMBOLS.RunPipelineUseCase]],
  [DI_SYMBOLS.LoadNodePaletteController, [DI_SYMBOLS.LoadNodePaletteUseCase]],
  [DI_SYMBOLS.GetNodeDefinitionController, [DI_SYMBOLS.GetNodeDefinitionUseCase]],
] as const satisfies readonly BindingExpectation[];

const PLANT_MODEL_BINDINGS = [
  [DI_SYMBOLS.PlantModelRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.PlantModelUseCases, [DI_SYMBOLS.PlantModelRepository]],
  [DI_SYMBOLS.PlantModelController, [DI_SYMBOLS.PlantModelUseCases]],
] as const satisfies readonly BindingExpectation[];

const STREAMING_BINDINGS = [
  [DI_SYMBOLS.StreamingRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.ManageStreamAdaptersUseCase, [DI_SYMBOLS.StreamingRepository]],
  [DI_SYMBOLS.ManageStreamAdaptersController, [DI_SYMBOLS.ManageStreamAdaptersUseCase]],
] as const satisfies readonly BindingExpectation[];

const DEVICE_BINDINGS = [
  [DI_SYMBOLS.DeviceRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.ListDeviceAdaptersUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ListDevicesUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.RegisterDeviceUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ActivateDeviceUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.SuspendDeviceUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.RotateDeviceCredentialUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.RetireDeviceUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.TransitionDeviceLifecycleUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ListDeviceLifecycleUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ReplaceDeviceUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.CreateFirmwareReleaseUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ListFirmwareReleasesUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ListFirmwareDeploymentsUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.StartFirmwareDeploymentUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.CreateFirmwareCampaignUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ListFirmwareCampaignsUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.TransitionFirmwareCampaignUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ListDeviceAlertsUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ListDeviceLogsUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.AcknowledgeDeviceAlertUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ClearDeviceAlertUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ListDeviceConfigurationsUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.PushDeviceConfigurationUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.CreateDeviceConfigurationTemplateUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ListDeviceConfigurationTemplatesUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.DeployDeviceConfigurationTemplateUseCase, [DI_SYMBOLS.DeviceRepository]],
  [DI_SYMBOLS.ListDeviceAdaptersController, [DI_SYMBOLS.ListDeviceAdaptersUseCase]],
  [DI_SYMBOLS.ListDevicesController, [DI_SYMBOLS.ListDevicesUseCase]],
  [DI_SYMBOLS.RegisterDeviceController, [DI_SYMBOLS.RegisterDeviceUseCase]],
  [DI_SYMBOLS.ActivateDeviceController, [DI_SYMBOLS.ActivateDeviceUseCase]],
  [DI_SYMBOLS.SuspendDeviceController, [DI_SYMBOLS.SuspendDeviceUseCase]],
  [DI_SYMBOLS.RotateDeviceCredentialController, [DI_SYMBOLS.RotateDeviceCredentialUseCase]],
  [DI_SYMBOLS.RetireDeviceController, [DI_SYMBOLS.RetireDeviceUseCase]],
  [DI_SYMBOLS.TransitionDeviceLifecycleController, [DI_SYMBOLS.TransitionDeviceLifecycleUseCase]],
  [DI_SYMBOLS.ListDeviceLifecycleController, [DI_SYMBOLS.ListDeviceLifecycleUseCase]],
  [DI_SYMBOLS.ReplaceDeviceController, [DI_SYMBOLS.ReplaceDeviceUseCase]],
  [DI_SYMBOLS.CreateFirmwareReleaseController, [DI_SYMBOLS.CreateFirmwareReleaseUseCase]],
  [DI_SYMBOLS.ListFirmwareReleasesController, [DI_SYMBOLS.ListFirmwareReleasesUseCase]],
  [DI_SYMBOLS.ListFirmwareDeploymentsController, [DI_SYMBOLS.ListFirmwareDeploymentsUseCase]],
  [DI_SYMBOLS.StartFirmwareDeploymentController, [DI_SYMBOLS.StartFirmwareDeploymentUseCase]],
  [DI_SYMBOLS.CreateFirmwareCampaignController, [DI_SYMBOLS.CreateFirmwareCampaignUseCase]],
  [DI_SYMBOLS.ListFirmwareCampaignsController, [DI_SYMBOLS.ListFirmwareCampaignsUseCase]],
  [DI_SYMBOLS.TransitionFirmwareCampaignController, [DI_SYMBOLS.TransitionFirmwareCampaignUseCase]],
  [DI_SYMBOLS.ListDeviceAlertsController, [DI_SYMBOLS.ListDeviceAlertsUseCase]],
  [DI_SYMBOLS.ListDeviceLogsController, [DI_SYMBOLS.ListDeviceLogsUseCase]],
  [DI_SYMBOLS.AcknowledgeDeviceAlertController, [DI_SYMBOLS.AcknowledgeDeviceAlertUseCase]],
  [DI_SYMBOLS.ClearDeviceAlertController, [DI_SYMBOLS.ClearDeviceAlertUseCase]],
  [DI_SYMBOLS.ListDeviceConfigurationsController, [DI_SYMBOLS.ListDeviceConfigurationsUseCase]],
  [DI_SYMBOLS.PushDeviceConfigurationController, [DI_SYMBOLS.PushDeviceConfigurationUseCase]],
  [
    DI_SYMBOLS.CreateDeviceConfigurationTemplateController,
    [DI_SYMBOLS.CreateDeviceConfigurationTemplateUseCase],
  ],
  [
    DI_SYMBOLS.ListDeviceConfigurationTemplatesController,
    [DI_SYMBOLS.ListDeviceConfigurationTemplatesUseCase],
  ],
  [
    DI_SYMBOLS.DeployDeviceConfigurationTemplateController,
    [DI_SYMBOLS.DeployDeviceConfigurationTemplateUseCase],
  ],
] as const satisfies readonly BindingExpectation[];

const TUTORIAL_BINDINGS = [
  [DI_SYMBOLS.TutorialRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.TutorialProgressRepository, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.TutorialFeatureAccessService, [DI_SYMBOLS.CoreApiClient]],
  [DI_SYMBOLS.WorkspaceContextService, [DI_SYMBOLS.CoreApiClient]],
  [
    DI_SYMBOLS.ListTutorialCatalogUseCase,
    [DI_SYMBOLS.TutorialRepository, DI_SYMBOLS.TutorialProgressRepository],
  ],
  [
    DI_SYMBOLS.OpenTutorialDetailUseCase,
    [
      DI_SYMBOLS.TutorialRepository,
      DI_SYMBOLS.TutorialFeatureAccessService,
      DI_SYMBOLS.WorkspaceContextService,
      DI_SYMBOLS.TutorialProgressRepository,
    ],
  ],
  [DI_SYMBOLS.OpenTutorialWalkthroughUseCase, [DI_SYMBOLS.TutorialRepository]],
  [
    DI_SYMBOLS.StartTutorialRunUseCase,
    [DI_SYMBOLS.TutorialRepository, DI_SYMBOLS.TutorialProgressRepository],
  ],
  [
    DI_SYMBOLS.AdvanceTutorialStepUseCase,
    [DI_SYMBOLS.TutorialRepository, DI_SYMBOLS.TutorialProgressRepository],
  ],
  [DI_SYMBOLS.PauseTutorialRunUseCase, [DI_SYMBOLS.TutorialProgressRepository]],
  [
    DI_SYMBOLS.ResumeTutorialRunUseCase,
    [
      DI_SYMBOLS.TutorialRepository,
      DI_SYMBOLS.TutorialProgressRepository,
      DI_SYMBOLS.TutorialFeatureAccessService,
      DI_SYMBOLS.WorkspaceContextService,
    ],
  ],
  [DI_SYMBOLS.CompleteTutorialRunUseCase, [DI_SYMBOLS.TutorialProgressRepository]],
  [
    DI_SYMBOLS.RepeatTutorialUseCase,
    [DI_SYMBOLS.TutorialRepository, DI_SYMBOLS.TutorialProgressRepository],
  ],
  [
    DI_SYMBOLS.ResolveOnboardingUseCase,
    [
      DI_SYMBOLS.TutorialRepository,
      DI_SYMBOLS.TutorialProgressRepository,
      DI_SYMBOLS.TutorialFeatureAccessService,
    ],
  ],
  [DI_SYMBOLS.RecordOnboardingDecisionUseCase, [DI_SYMBOLS.TutorialProgressRepository]],
  [DI_SYMBOLS.ListTutorialCatalogController, [DI_SYMBOLS.ListTutorialCatalogUseCase]],
  [DI_SYMBOLS.OpenTutorialDetailController, [DI_SYMBOLS.OpenTutorialDetailUseCase]],
  [DI_SYMBOLS.OpenTutorialWalkthroughController, [DI_SYMBOLS.OpenTutorialWalkthroughUseCase]],
  [DI_SYMBOLS.StartTutorialRunController, [DI_SYMBOLS.StartTutorialRunUseCase]],
  [DI_SYMBOLS.AdvanceTutorialStepController, [DI_SYMBOLS.AdvanceTutorialStepUseCase]],
  [DI_SYMBOLS.PauseTutorialRunController, [DI_SYMBOLS.PauseTutorialRunUseCase]],
  [DI_SYMBOLS.ResumeTutorialRunController, [DI_SYMBOLS.ResumeTutorialRunUseCase]],
  [DI_SYMBOLS.CompleteTutorialRunController, [DI_SYMBOLS.CompleteTutorialRunUseCase]],
  [DI_SYMBOLS.RepeatTutorialController, [DI_SYMBOLS.RepeatTutorialUseCase]],
  [DI_SYMBOLS.ResolveOnboardingController, [DI_SYMBOLS.ResolveOnboardingUseCase]],
  [DI_SYMBOLS.RecordOnboardingDecisionController, [DI_SYMBOLS.RecordOnboardingDecisionUseCase]],
] as const satisfies readonly BindingExpectation[];
