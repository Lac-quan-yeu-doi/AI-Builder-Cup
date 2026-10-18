import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const {
  getInjection,
  observeAssignMetadataCrawlerRequiredAction,
  observeCreateDatabaseRequiredAction,
  observeCreateDatabaseSourceRequiredAction,
  observeRunMetadataCrawlerRequiredAction,
  observeRunQueryRequiredAction,
  observeTestDatabaseConnectionRequiredAction,
  replace,
} = vi.hoisted(() => ({
  getInjection: vi.fn((key: string) => Object.freeze({ key })),
  observeAssignMetadataCrawlerRequiredAction: vi.fn((controller: unknown) => controller),
  observeCreateDatabaseRequiredAction: vi.fn((controller: unknown) => controller),
  observeCreateDatabaseSourceRequiredAction: vi.fn((controller: unknown) => controller),
  observeRunMetadataCrawlerRequiredAction: vi.fn((controller: unknown) => controller),
  observeRunQueryRequiredAction: vi.fn((controller: unknown) => controller),
  observeTestDatabaseConnectionRequiredAction: vi.fn((controller: unknown) => controller),
  replace: vi.fn(),
}));

vi.mock('@/di/container', () => ({ getInjection }));
vi.mock('@/app/_components/shared/workspace-required-actions', () => ({
  observeAssignMetadataCrawlerRequiredAction,
  observeCreateDatabaseRequiredAction,
  observeCreateDatabaseSourceRequiredAction,
  observeRunMetadataCrawlerRequiredAction,
  observeRunQueryRequiredAction,
  observeTestDatabaseConnectionRequiredAction,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/app/_providers/current-user-provider', () => ({
  useCurrentUserId: () => 'local-user',
}));
vi.mock('@/app/(workspace)/catalog/_components/catalog-explorer-screen', () => ({
  CatalogExplorerScreen: () => null,
}));
vi.mock('@/app/_components/database-service/database-services-screen', () => ({
  DatabaseServicesScreen: () => null,
}));
vi.mock('@/app/_components/execution/executions-screen', () => ({
  ExecutionsScreen: () => null,
}));
vi.mock('@/app/(workspace)/sql/_components/query-workbench-screen', () => ({
  QueryWorkbenchScreen: () => null,
}));
vi.mock('@/app/_components/pipeline/pipelines-screen', () => ({
  PipelinesScreen: () => null,
}));
vi.mock('@/app/(workspace)/metadata-crawler/_components/metadata-crawler-screen', () => ({
  MetadataCrawlerScreen: () => null,
}));
vi.mock('@/app/(workspace)/automations/_components/automation-workflow-screen', () => ({
  AutomationWorkflowScreen: () => null,
}));
vi.mock(
  '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-detail-screen',
  () => ({ AutomationWorkflowDetailScreen: () => null }),
);
vi.mock('@/app/_components/device/device-management-screen', () => ({
  DeviceManagementScreen: () => null,
}));
vi.mock('@/app/(workspace)/plant-model/[siteId]/_components/plant-model-screen', () => ({
  PlantModelScreen: () => null,
}));
vi.mock('@/app/(workspace)/plant-model/walkthrough/_components/plant-walkthrough-screen', () => ({
  PlantWalkthroughScreen: () => null,
}));

import { CatalogExplorerFeature } from '@/app/(workspace)/catalog/_components/catalog-explorer-feature';
import { DatabaseServiceFeature } from '@/app/_components/database-service/database-service-feature';
import { ExecutionMonitoringFeature } from '@/app/_components/execution/execution-monitoring-feature';
import { QueryWorkbenchFeature } from '@/app/(workspace)/sql/_components/query-workbench-feature';
import { PipelineListFeature } from '@/app/_components/pipeline/pipeline-list-feature';
import { MetadataCrawlerFeature } from '@/app/(workspace)/metadata-crawler/_components/metadata-crawler-feature';
import { AutomationWorkflowFeature } from '@/app/(workspace)/automations/_components/automation-workflow-feature';
import { AutomationWorkflowDetailFeature } from '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-detail-feature';
import { DeviceManagementFeature } from '@/app/_components/device/device-management-feature';
import { PlantModelFeature } from '@/app/(workspace)/plant-model/[siteId]/_components/plant-model-feature';
import { PlantWalkthroughFeature } from '@/app/(workspace)/plant-model/walkthrough/_components/plant-walkthrough-feature';

interface InjectedController {
  readonly key: string;
}

type InjectedFeature = ReactElement<{
  readonly controllers: Readonly<
    Record<string, InjectedController | ((...args: never[]) => unknown)>
  >;
}>;

describe('injected client feature roots', () => {
  it.each([
    [
      'database services',
      DatabaseServiceFeature,
      {
        list: 'ListDatabaseServicesController',
        listAvailable: 'ListAvailableDatabaseServicesController',
        listConnectors: 'ListDatabaseServiceConnectorsController',
        get: 'GetDatabaseServiceController',
        testUnsaved: 'TestUnsavedDatabaseServiceController',
        testSaved: 'TestSavedDatabaseServiceController',
        create: 'CreateDatabaseServiceController',
        update: 'UpdateDatabaseServiceController',
        archive: 'ArchiveDatabaseServiceController',
        attach: 'AttachDatabaseServiceController',
        detach: 'DetachDatabaseServiceController',
        metadataCrawler: 'MetadataCrawlerController',
      },
    ],
    [
      'catalog',
      CatalogExplorerFeature,
      {
        listCatalogs: 'ListCatalogsController',
        createNamespace: 'CreateNamespaceController',
        updateNamespaceDescription: 'UpdateNamespaceDescriptionController',
        listNamespaces: 'ListNamespacesController',
        listTables: 'ListTablesController',
        loadMetadata: 'LoadTableMetadataController',
        listSnapshots: 'ListTableSnapshotsController',
        preview: 'PreviewTableController',
        monitorPreview: 'MonitorTablePreviewController',
      },
    ],
    [
      'executions',
      ExecutionMonitoringFeature,
      {
        list: 'ListExecutionsController',
        get: 'GetExecutionController',
        cancel: 'CancelExecutionController',
        getLogs: 'GetExecutionLogsController',
        rerun: 'RerunExecutionController',
        monitor: 'MonitorExecutionController',
        listPipelines: 'ListPipelinesController',
      },
    ],
    [
      'queries',
      QueryWorkbenchFeature,
      {
        listCatalogs: 'ListQueryCatalogsController',
        listNamespaces: 'ListQueryNamespacesController',
        listHistory: 'ListQueryHistoryController',
        get: 'GetQueryController',
        cancel: 'CancelQueryController',
        submit: 'SubmitQueryController',
        monitor: 'MonitorQueryController',
      },
    ],
    [
      'pipelines',
      PipelineListFeature,
      {
        list: 'ListPipelinesController',
        create: 'CreatePipelineController',
        // Filing an unfiled pipeline under this database reads the draft back
        // before saving it: the save endpoint is optimistic on version and
        // takes the whole graph.
        get: 'GetPipelineController',
        save: 'SavePipelineController',
        clone: 'ClonePipelineController',
        archive: 'ArchivePipelineController',
        listDatabases: 'composed',
      },
    ],
    [
      'devices',
      DeviceManagementFeature,
      {
        listAdapters: 'ListDeviceAdaptersController',
        list: 'ListDevicesController',
        register: 'RegisterDeviceController',
        activate: 'ActivateDeviceController',
        suspend: 'SuspendDeviceController',
        rotateCredential: 'RotateDeviceCredentialController',
        retire: 'RetireDeviceController',
        transitionLifecycle: 'TransitionDeviceLifecycleController',
        listLifecycle: 'ListDeviceLifecycleController',
        replace: 'ReplaceDeviceController',
        createFirmwareRelease: 'CreateFirmwareReleaseController',
        listFirmwareReleases: 'ListFirmwareReleasesController',
        listFirmwareDeployments: 'ListFirmwareDeploymentsController',
        startFirmwareDeployment: 'StartFirmwareDeploymentController',
        createFirmwareCampaign: 'CreateFirmwareCampaignController',
        listFirmwareCampaigns: 'ListFirmwareCampaignsController',
        transitionFirmwareCampaign: 'TransitionFirmwareCampaignController',
        listAlerts: 'ListDeviceAlertsController',
        listLogs: 'ListDeviceLogsController',
        acknowledgeAlert: 'AcknowledgeDeviceAlertController',
        clearAlert: 'ClearDeviceAlertController',
        listConfigurations: 'ListDeviceConfigurationsController',
        pushConfiguration: 'PushDeviceConfigurationController',
        createConfigurationTemplate: 'CreateDeviceConfigurationTemplateController',
        listConfigurationTemplates: 'ListDeviceConfigurationTemplatesController',
        deployConfigurationTemplate: 'DeployDeviceConfigurationTemplateController',
      },
    ],
  ] as const)('wires the complete frozen %s controller set', (_name, Feature, expected) => {
    // Both source and pipeline features are scoped to a database now; the prop
    // is irrelevant to what this test pins, which is the injected controller set.
    const element = (Feature as (props: { databaseName: string }) => unknown)({
      databaseName: 'demo',
    }) as InjectedFeature;
    const controllers = element.props.controllers;

    expect(Object.isFrozen(controllers)).toBe(true);
    expect(
      Object.fromEntries(
        Object.entries(controllers).map(([key, controller]) => [
          key,
          typeof controller === 'function' ? 'composed' : controller.key,
        ]),
      ),
    ).toEqual(expected);
  });

  it('decorates the exact injected query submit controller without resolving a guided substitute', () => {
    expect(observeRunQueryRequiredAction).toHaveBeenCalledOnce();
    expect(observeRunQueryRequiredAction).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'SubmitQueryController' }),
    );
    expect(getInjection).toHaveBeenCalledWith('SubmitQueryController');
  });

  it('wires the Metadata Crawler controller facade', () => {
    const element = MetadataCrawlerFeature() as unknown as {
      readonly props: { readonly controller: InjectedController };
    };
    expect(element.props.controller.key).toBe('MetadataCrawlerController');
  });

  it('wires the plant walkthrough to its own controller', () => {
    const element = PlantWalkthroughFeature() as unknown as {
      readonly props: { readonly controller: InjectedController };
    };
    expect(element.props.controller.key).toBe('PlantWalkthroughController');
  });

  it('wires Plant Model with its editor and readable catalog metadata controllers', () => {
    const element = PlantModelFeature({ siteId: 'site-1' }) as unknown as {
      readonly props: {
        readonly controller: InjectedController;
        readonly catalogMetadata: Readonly<Record<string, InjectedController>>;
      };
    };

    expect(element.props.controller.key).toBe('PlantModelController');
    expect(Object.isFrozen(element.props.catalogMetadata)).toBe(true);
    expect(
      Object.fromEntries(
        Object.entries(element.props.catalogMetadata).map(([key, controller]) => [
          key,
          controller.key,
        ]),
      ),
    ).toEqual({
      listCatalogs: 'ListCatalogsController',
      listNamespaces: 'ListNamespacesController',
      listTables: 'ListTablesController',
      loadTableMetadata: 'LoadTableMetadataController',
    });
  });

  it('wires the Automations controller facade', () => {
    const element = AutomationWorkflowFeature() as unknown as {
      readonly props: { readonly controller: InjectedController };
    };
    expect(element.props.controller.key).toBe('AutomationWorkflowController');
  });

  it('wires the Automation workflow detail controller facade', () => {
    const element = AutomationWorkflowDetailFeature({
      workflowId: 'wf-1',
    }) as unknown as {
      readonly props: { readonly controller: InjectedController };
    };
    expect(element.props.controller.key).toBe('AutomationWorkflowController');
  });

  it('keeps the selected execution in the URL without scrolling the page', () => {
    const element = ExecutionMonitoringFeature({
      initialExecutionId: 'execution-1',
    }) as unknown as ReactElement<{
      readonly onSelectionChange: (executionId: string) => void;
    }>;

    element.props.onSelectionChange('execution/2');

    expect(replace).toHaveBeenCalledWith('/executions?executionId=execution%2F2', {
      scroll: false,
    });
  });
});
