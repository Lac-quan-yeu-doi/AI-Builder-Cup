import type { ChatRepository } from '@/src/application/repositories/chat.repository.interface';
import type { MessageBlockRepository } from '@/src/application/repositories/message-block.repository.interface';
import type { ChartRepository } from '@/src/application/repositories/chart.repository.interface';
import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type { ChartCollectionRepository } from '@/src/application/repositories/chart-collection.repository.interface';
import type { DashboardRepository } from '@/src/application/repositories/dashboard.repository.interface';
import type { PlantModelRepository } from '@/src/application/repositories/plant-model.repository.interface';
import type { PlantModelUseCases } from '@/src/application/use-cases/plant-model/manage-plant-model.use-cases';
import type { PlantModelController } from '@/src/interface-adapters/controllers/plant-model/plant-model.controller';
import type { PlantWalkthroughService } from '@/src/application/services/plant-walkthrough.service.interface';
import type { PlantWalkthroughUseCases } from '@/src/application/use-cases/plant-model/plant-walkthrough.use-cases';
import type { PlantWalkthroughController } from '@/src/interface-adapters/controllers/plant-model/plant-walkthrough.controller';
import type { ChartEncodingSuggestionRepository } from '@/src/application/repositories/chart-encoding-suggestion.repository.interface';
import type { PendingActionRepository } from '@/src/application/repositories/pending-action.repository.interface';
import type { ActionCatalogRepository } from '@/src/application/repositories/action-catalog.repository.interface';
import type { AgentManifestRepository } from '@/src/application/repositories/agent-manifest.repository.interface';
import type { SkillRepository } from '@/src/application/repositories/skill.repository.interface';
import type { CitationRepository } from '@/src/application/repositories/citation.repository.interface';
import type { DocumentRepository } from '@/src/application/repositories/document.repository.interface';
import type { WorkspaceTreeRepository } from '@/src/application/repositories/workspace-tree.repository.interface';
import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';
import type { ListWorkspaceTreeUseCase } from '@/src/application/use-cases/workspace-tree/list-workspace-tree.use-case';
import type { GetWorkspaceFileContentUseCase } from '@/src/application/use-cases/workspace-tree/get-workspace-file-content.use-case';
import type { ListWorkspaceTreeController } from '@/src/interface-adapters/controllers/workspace-tree/list-workspace-tree.controller';
import type { GetWorkspaceFileContentController } from '@/src/interface-adapters/controllers/workspace-tree/get-workspace-file-content.controller';
import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';
import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';
import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';
import type { NodeCatalogRepository } from '@/src/application/repositories/node-catalog.repository.interface';
import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';
import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';
import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';
import type { StreamingRepository } from '@/src/application/repositories/streaming.repository.interface';
import type { DeviceRepository } from '@/src/application/repositories/device.repository.interface';
import type { MetadataCrawlerRepository } from '@/src/application/repositories/metadata-crawler.repository.interface';
import type { SourceMetadataRepository } from '@/src/application/repositories/source-metadata.repository.interface';
import type { AutomationWorkflowRepository } from '@/src/application/repositories/automation-workflow.repository.interface';
import type { DataWorkflowRepository } from '@/src/application/repositories/data-workflow.repository.interface';
import type { ExecutionProgressService } from '@/src/application/services/execution-progress.service.interface';
import type { QueryProgressService } from '@/src/application/services/query-progress.service.interface';
import type { MessageBlockProgressService } from '@/src/application/services/message-block-progress.service.interface';
import type { ChartProgressService } from '@/src/application/services/chart-progress.service.interface';
import type { ChartRendererService } from '@/src/application/services/chart-renderer.service.interface';
import type { DashboardRuntimeService } from '@/src/application/services/dashboard-runtime.service.interface';
import type { SchedulerService } from '@/src/application/services/scheduler.service.interface';
import type { ManageChatUseCase } from '@/src/application/use-cases/chat/manage-chat.use-case';
import type { ListMessageBlockHistoryUseCase } from '@/src/application/use-cases/message-blocks/list-message-block-history.use-case';
import type { SubscribeMessageBlocksUseCase } from '@/src/application/use-cases/message-blocks/subscribe-message-blocks.use-case';
import type { ListChartsUseCase } from '@/src/application/use-cases/charts/list-charts.use-case';
import type { SubscribeChartsUseCase } from '@/src/application/use-cases/charts/subscribe-charts.use-case';
import type { CreateChartUseCase } from '@/src/application/use-cases/charts/create-chart.use-case';
import type { PatchChartUseCase } from '@/src/application/use-cases/charts/patch-chart.use-case';
import type { DeleteChartUseCase } from '@/src/application/use-cases/charts/delete-chart.use-case';
import type { SetChartDataFromCsvUseCase } from '@/src/application/use-cases/charts/set-chart-data-from-csv.use-case';
import type { SuggestChartEncodingsUseCase } from '@/src/application/use-cases/charts/suggest-chart-encodings.use-case';
import type { PreviewCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/preview-canonical-chart.use-case';
import type { PreviewCanonicalChartQueryUseCase } from '@/src/application/use-cases/canonical-charts/preview-canonical-chart-query.use-case';
import type { CompileCanonicalChartQueryUseCase } from '@/src/application/use-cases/canonical-charts/compile-canonical-chart-query.use-case';
import type { CreateCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/create-canonical-chart.use-case';
import type { GetCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/get-canonical-chart.use-case';
import type { RunSavedCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/run-saved-canonical-chart.use-case';
import type { ListCanonicalChartsUseCase } from '@/src/application/use-cases/canonical-charts/list-canonical-charts.use-case';
import type { UpdateCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/update-canonical-chart.use-case';
import type { ListCanonicalChartRevisionsUseCase } from '@/src/application/use-cases/canonical-charts/list-canonical-chart-revisions.use-case';
import type { RestoreCanonicalChartRevisionUseCase } from '@/src/application/use-cases/canonical-charts/restore-canonical-chart-revision.use-case';
import type { CancelCanonicalChartRunUseCase } from '@/src/application/use-cases/canonical-charts/cancel-canonical-chart-run.use-case';
import type { SaveAsNewCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/save-as-new-canonical-chart.use-case';
import type { SaveChatChartPreviewUseCase } from '@/src/application/use-cases/canonical-charts/save-chat-chart-preview.use-case';
import type { ListChartCollectionsUseCase } from '@/src/application/use-cases/chart-collections/list-chart-collections.use-case';
import type { ChartCollectionUseCases } from '@/src/application/use-cases/chart-collections/manage-chart-collection.use-cases';
import type { ArchiveDashboardUseCase } from '@/src/application/use-cases/dashboards/archive-dashboard.use-case';
import type { CopyDashboardUseCase } from '@/src/application/use-cases/dashboards/copy-dashboard.use-case';
import type { CreateDashboardUseCase } from '@/src/application/use-cases/dashboards/create-dashboard.use-case';
import type { GetDashboardUseCase } from '@/src/application/use-cases/dashboards/get-dashboard.use-case';
import type { ListDashboardsUseCase } from '@/src/application/use-cases/dashboards/list-dashboards.use-case';
import type { SaveDashboardUseCase } from '@/src/application/use-cases/dashboards/save-dashboard.use-case';
import type { ExecuteDashboardUseCase } from '@/src/application/use-cases/dashboards/execute-dashboard.use-case';
import type { ListDashboardFilterTargetsUseCase } from '@/src/application/use-cases/dashboards/list-dashboard-filter-targets.use-case';
import type { ListChartCollectionsController } from '@/src/interface-adapters/controllers/chart-collections/list-chart-collections.controller';
import type { CreateChartCollectionController } from '@/src/interface-adapters/controllers/chart-collections/create-chart-collection.controller';
import type { UpdateChartCollectionController } from '@/src/interface-adapters/controllers/chart-collections/update-chart-collection.controller';
import type { MoveChartCollectionController } from '@/src/interface-adapters/controllers/chart-collections/move-chart-collection.controller';
import type { ArchiveChartCollectionController } from '@/src/interface-adapters/controllers/chart-collections/archive-chart-collection.controller';
import type { ArchiveDashboardController } from '@/src/interface-adapters/controllers/dashboards/archive-dashboard.controller';
import type { CopyDashboardController } from '@/src/interface-adapters/controllers/dashboards/copy-dashboard.controller';
import type { CreateDashboardController } from '@/src/interface-adapters/controllers/dashboards/create-dashboard.controller';
import type { GetDashboardController } from '@/src/interface-adapters/controllers/dashboards/get-dashboard.controller';
import type { ListDashboardsController } from '@/src/interface-adapters/controllers/dashboards/list-dashboards.controller';
import type { SaveDashboardController } from '@/src/interface-adapters/controllers/dashboards/save-dashboard.controller';
import type { ExecuteDashboardController } from '@/src/interface-adapters/controllers/dashboards/execute-dashboard.controller';
import type { ListDashboardFilterTargetsController } from '@/src/interface-adapters/controllers/dashboards/list-dashboard-filter-targets.controller';
import type { ListPendingActionsUseCase } from '@/src/application/use-cases/pending-actions/list-pending-actions.use-case';
import type { GetPendingActionUseCase } from '@/src/application/use-cases/pending-actions/get-pending-action.use-case';
import type { ApprovePendingActionUseCase } from '@/src/application/use-cases/pending-actions/approve-pending-action.use-case';
import type { RejectPendingActionUseCase } from '@/src/application/use-cases/pending-actions/reject-pending-action.use-case';
import type { ListActionCatalogUseCase } from '@/src/application/use-cases/action-catalog/list-action-catalog.use-case';
import type { ListAgentManifestsUseCase } from '@/src/application/use-cases/agent-manifests/list-agent-manifests.use-case';
import type { GetAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/get-agent-manifest.use-case';
import type { SaveAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/save-agent-manifest.use-case';
import type { ValidateAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/validate-agent-manifest.use-case';
import type { DeleteAgentManifestUseCase } from '@/src/application/use-cases/agent-manifests/delete-agent-manifest.use-case';
import type { ListSkillsUseCase } from '@/src/application/use-cases/skills/list-skills.use-case';
import type { GetSkillUseCase } from '@/src/application/use-cases/skills/get-skill.use-case';
import type { CreateSkillUseCase } from '@/src/application/use-cases/skills/create-skill.use-case';
import type { UpdateSkillUseCase } from '@/src/application/use-cases/skills/update-skill.use-case';
import type { DeleteSkillUseCase } from '@/src/application/use-cases/skills/delete-skill.use-case';
import type { ResolveCitationsUseCase } from '@/src/application/use-cases/citations/resolve-citations.use-case';
import type { ListDocumentsUseCase } from '@/src/application/use-cases/documents/list-documents.use-case';
import type { UploadDocumentUseCase } from '@/src/application/use-cases/documents/upload-document.use-case';
import type { GetDocumentContentUseCase } from '@/src/application/use-cases/documents/get-document-content.use-case';
import type { ListCatalogsUseCase } from '@/src/application/use-cases/catalog/list-catalogs.use-case';
import type { CreateNamespaceUseCase } from '@/src/application/use-cases/catalog/create-namespace.use-case';
import type { UpdateNamespaceDescriptionUseCase } from '@/src/application/use-cases/catalog/update-namespace-description.use-case';
import type { ListNamespacesUseCase } from '@/src/application/use-cases/catalog/list-namespaces.use-case';
import type { ListTableSnapshotsUseCase } from '@/src/application/use-cases/catalog/list-table-snapshots.use-case';
import type { ListTablesUseCase } from '@/src/application/use-cases/catalog/list-tables.use-case';
import type { LoadTableMetadataUseCase } from '@/src/application/use-cases/catalog/load-table-metadata.use-case';
import type { MonitorTablePreviewUseCase } from '@/src/application/use-cases/catalog/monitor-table-preview.use-case';
import type { PreviewTableUseCase } from '@/src/application/use-cases/catalog/preview-table.use-case';
import type { ArchiveDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/archive-database-service.use-case';
import type { AttachDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/attach-database-service.use-case';
import type { CdcConnectionProfileUseCases } from '@/src/application/use-cases/database-services/cdc-connection-profile.use-cases';
import type { CreateDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/create-database-service.use-case';
import type { GetDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/get-database-service.use-case';
import type { ListDatabaseServicesUseCase } from '@/src/application/use-cases/database-services/list-database-services.use-case';
import type { ListAvailableDatabaseServicesUseCase } from '@/src/application/use-cases/database-services/list-available-database-services.use-case';
import type { ListDatabaseServiceConnectorsUseCase } from '@/src/application/use-cases/database-services/list-database-service-connectors.use-case';
import type { TestSavedDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/test-saved-database-service.use-case';
import type { TestUnsavedDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/test-unsaved-database-service.use-case';
import type { UpdateDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/update-database-service.use-case';
import type { DetachDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/detach-database-service.use-case';
import type { ArchiveConnectionUseCase } from '@/src/application/use-cases/connections/archive-connection.use-case';
import type { CreateConnectionUseCase } from '@/src/application/use-cases/connections/create-connection.use-case';
import type { GetConnectionUseCase } from '@/src/application/use-cases/connections/get-connection.use-case';
import type { ListConnectionsUseCase } from '@/src/application/use-cases/connections/list-connections.use-case';
import type { TestSavedConnectionUseCase } from '@/src/application/use-cases/connections/test-saved-connection.use-case';
import type { TestUnsavedConnectionUseCase } from '@/src/application/use-cases/connections/test-unsaved-connection.use-case';
import type { UpdateConnectionUseCase } from '@/src/application/use-cases/connections/update-connection.use-case';
import type { CancelExecutionUseCase } from '@/src/application/use-cases/executions/cancel-execution.use-case';
import type { GetExecutionLogsUseCase } from '@/src/application/use-cases/executions/get-execution-logs.use-case';
import type { GetExecutionUseCase } from '@/src/application/use-cases/executions/get-execution.use-case';
import type { ListExecutionsUseCase } from '@/src/application/use-cases/executions/list-executions.use-case';
import type { MonitorExecutionUseCase } from '@/src/application/use-cases/executions/monitor-execution.use-case';
import type { RerunExecutionUseCase } from '@/src/application/use-cases/executions/rerun-execution.use-case';
import type { GetNodeDefinitionUseCase } from '@/src/application/use-cases/node-catalog/get-node-definition.use-case';
import type { LoadNodePaletteUseCase } from '@/src/application/use-cases/node-catalog/load-node-palette.use-case';
import type { ArchivePipelineUseCase } from '@/src/application/use-cases/pipelines/archive-pipeline.use-case';
import type { ClonePipelineUseCase } from '@/src/application/use-cases/pipelines/clone-pipeline.use-case';
import type { CreatePipelineUseCase } from '@/src/application/use-cases/pipelines/create-pipeline.use-case';
import type { GetPipelineUseCase } from '@/src/application/use-cases/pipelines/get-pipeline.use-case';
import type { GetOrCompilePipelineScriptUseCase } from '@/src/application/use-cases/pipelines/get-or-compile-pipeline-script.use-case';
import type { ListPipelinesUseCase } from '@/src/application/use-cases/pipelines/list-pipelines.use-case';
import type { PreviewPipelineNodeUseCase } from '@/src/application/use-cases/pipelines/preview-pipeline-node.use-case';
import type { RunPipelineUseCase } from '@/src/application/use-cases/pipelines/run-pipeline.use-case';
import type { SavePipelineUseCase } from '@/src/application/use-cases/pipelines/save-pipeline.use-case';
import type { ValidatePipelineEdgeUseCase } from '@/src/application/use-cases/pipelines/validate-pipeline-edge.use-case';
import type { ValidatePipelineGraphUseCase } from '@/src/application/use-cases/pipelines/validate-pipeline-graph.use-case';
import type { CancelQueryUseCase } from '@/src/application/use-cases/queries/cancel-query.use-case';
import type { GetQueryUseCase } from '@/src/application/use-cases/queries/get-query.use-case';
import type { ListQueryCatalogsUseCase } from '@/src/application/use-cases/queries/list-query-catalogs.use-case';
import type { ListQueryHistoryUseCase } from '@/src/application/use-cases/queries/list-query-history.use-case';
import type { ListQueryNamespacesUseCase } from '@/src/application/use-cases/queries/list-query-namespaces.use-case';
import type { MonitorQueryUseCase } from '@/src/application/use-cases/queries/monitor-query.use-case';
import type { SubmitQueryUseCase } from '@/src/application/use-cases/queries/submit-query.use-case';
import type { GetScriptUseCase } from '@/src/application/use-cases/scripts/get-script.use-case';
import type { ListActiveConnectionsUseCase } from '@/src/application/use-cases/scripts/list-active-connections.use-case';
import type { ListScriptVersionsUseCase } from '@/src/application/use-cases/scripts/list-script-versions.use-case';
import type { ListScriptsUseCase } from '@/src/application/use-cases/scripts/list-scripts.use-case';
import type { LoadScriptVersionSourceUseCase } from '@/src/application/use-cases/scripts/load-script-version-source.use-case';
import type { SaveAndRunScriptUseCase } from '@/src/application/use-cases/scripts/save-and-run-script.use-case';
import type { SaveScriptUseCase } from '@/src/application/use-cases/scripts/save-script.use-case';
import type { ManageStreamAdaptersUseCase } from '@/src/application/use-cases/streaming/manage-stream-adapters.use-case';
import type { ActivateDeviceUseCase } from '@/src/application/use-cases/devices/activate-device.use-case';
import type { ListDeviceAdaptersUseCase } from '@/src/application/use-cases/devices/list-device-adapters.use-case';
import type { ListDevicesUseCase } from '@/src/application/use-cases/devices/list-devices.use-case';
import type { RegisterDeviceUseCase } from '@/src/application/use-cases/devices/register-device.use-case';
import type { RetireDeviceUseCase } from '@/src/application/use-cases/devices/retire-device.use-case';
import type { RotateDeviceCredentialUseCase } from '@/src/application/use-cases/devices/rotate-device-credential.use-case';
import type { SuspendDeviceUseCase } from '@/src/application/use-cases/devices/suspend-device.use-case';
import type { TransitionDeviceLifecycleUseCase } from '@/src/application/use-cases/devices/transition-device-lifecycle.use-case';
import type { ListDeviceLifecycleUseCase } from '@/src/application/use-cases/devices/list-device-lifecycle.use-case';
import type { ReplaceDeviceUseCase } from '@/src/application/use-cases/devices/replace-device.use-case';
import type { CreateFirmwareReleaseUseCase } from '@/src/application/use-cases/devices/create-firmware-release.use-case';
import type { ListFirmwareDeploymentsUseCase } from '@/src/application/use-cases/devices/list-firmware-deployments.use-case';
import type { ListFirmwareReleasesUseCase } from '@/src/application/use-cases/devices/list-firmware-releases.use-case';
import type { StartFirmwareDeploymentUseCase } from '@/src/application/use-cases/devices/start-firmware-deployment.use-case';
import type { CreateFirmwareCampaignUseCase } from '@/src/application/use-cases/devices/create-firmware-campaign.use-case';
import type { ListFirmwareCampaignsUseCase } from '@/src/application/use-cases/devices/list-firmware-campaigns.use-case';
import type { TransitionFirmwareCampaignUseCase } from '@/src/application/use-cases/devices/transition-firmware-campaign.use-case';
import type { ListDeviceAlertsUseCase } from '@/src/application/use-cases/devices/list-device-alerts.use-case';
import type { ListDeviceLogsUseCase } from '@/src/application/use-cases/devices/list-device-logs.use-case';
import type { AcknowledgeDeviceAlertUseCase } from '@/src/application/use-cases/devices/acknowledge-device-alert.use-case';
import type { ClearDeviceAlertUseCase } from '@/src/application/use-cases/devices/clear-device-alert.use-case';
import type { ListDeviceConfigurationsUseCase } from '@/src/application/use-cases/devices/list-device-configurations.use-case';
import type { PushDeviceConfigurationUseCase } from '@/src/application/use-cases/devices/push-device-configuration.use-case';
import type { CreateDeviceConfigurationTemplateUseCase } from '@/src/application/use-cases/devices/create-device-configuration-template.use-case';
import type { ListDeviceConfigurationTemplatesUseCase } from '@/src/application/use-cases/devices/list-device-configuration-templates.use-case';
import type { DeployDeviceConfigurationTemplateUseCase } from '@/src/application/use-cases/devices/deploy-device-configuration-template.use-case';
import type { MetadataCrawlerUseCases } from '@/src/application/use-cases/metadata-crawler/metadata-crawler.use-cases';
import type { AutomationWorkflowUseCases } from '@/src/application/use-cases/automation-workflow/automation-workflow.use-cases';
import type { DataWorkflowUseCases } from '@/src/application/use-cases/data-workflow/data-workflow.use-cases';
import type { SourceMetadataUseCases } from '@/src/application/use-cases/metadata-crawler/source-metadata.use-cases';
import type { CoreApiClient } from '@/src/infrastructure/api/core-api-client';
import type { ManageChatController } from '@/src/interface-adapters/controllers/chat/manage-chat.controller';
import type { ListMessageBlockHistoryController } from '@/src/interface-adapters/controllers/message-blocks/list-message-block-history.controller';
import type { SubscribeMessageBlocksController } from '@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller';
import type { ListChartsController } from '@/src/interface-adapters/controllers/charts/list-charts.controller';
import type { SubscribeChartsController } from '@/src/interface-adapters/controllers/charts/subscribe-charts.controller';
import type { CreateChartController } from '@/src/interface-adapters/controllers/charts/create-chart.controller';
import type { PatchChartController } from '@/src/interface-adapters/controllers/charts/patch-chart.controller';
import type { DeleteChartController } from '@/src/interface-adapters/controllers/charts/delete-chart.controller';
import type { SetChartDataFromCsvController } from '@/src/interface-adapters/controllers/charts/set-chart-data-from-csv.controller';
import type { SuggestChartEncodingsController } from '@/src/interface-adapters/controllers/charts/suggest-chart-encodings.controller';
import type { PreviewCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/preview-canonical-chart.controller';
import type { PreviewCanonicalChartQueryController } from '@/src/interface-adapters/controllers/canonical-charts/preview-canonical-chart-query.controller';
import type { CompileCanonicalChartQueryController } from '@/src/interface-adapters/controllers/canonical-charts/compile-canonical-chart-query.controller';
import type { CreateCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/create-canonical-chart.controller';
import type { GetCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/get-canonical-chart.controller';
import type { RunSavedCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/run-saved-canonical-chart.controller';
import type { ListCanonicalChartsController } from '@/src/interface-adapters/controllers/canonical-charts/list-canonical-charts.controller';
import type { UpdateCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/update-canonical-chart.controller';
import type { ListCanonicalChartRevisionsController } from '@/src/interface-adapters/controllers/canonical-charts/list-canonical-chart-revisions.controller';
import type { RestoreCanonicalChartRevisionController } from '@/src/interface-adapters/controllers/canonical-charts/restore-canonical-chart-revision.controller';
import type { CancelCanonicalChartRunController } from '@/src/interface-adapters/controllers/canonical-charts/cancel-canonical-chart-run.controller';
import type { SaveAsNewCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/save-as-new-canonical-chart.controller';
import type { SaveChatChartPreviewController } from '@/src/interface-adapters/controllers/canonical-charts/save-chat-chart-preview.controller';
import type { ListPendingActionsController } from '@/src/interface-adapters/controllers/pending-actions/list-pending-actions.controller';
import type { GetPendingActionController } from '@/src/interface-adapters/controllers/pending-actions/get-pending-action.controller';
import type { ApprovePendingActionController } from '@/src/interface-adapters/controllers/pending-actions/approve-pending-action.controller';
import type { RejectPendingActionController } from '@/src/interface-adapters/controllers/pending-actions/reject-pending-action.controller';
import type { ListActionCatalogController } from '@/src/interface-adapters/controllers/action-catalog/list-action-catalog.controller';
import type { ListAgentManifestsController } from '@/src/interface-adapters/controllers/agent-manifests/list-agent-manifests.controller';
import type { GetAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/get-agent-manifest.controller';
import type { SaveAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/save-agent-manifest.controller';
import type { ValidateAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/validate-agent-manifest.controller';
import type { DeleteAgentManifestController } from '@/src/interface-adapters/controllers/agent-manifests/delete-agent-manifest.controller';
import type { ListSkillsController } from '@/src/interface-adapters/controllers/skills/list-skills.controller';
import type { GetSkillController } from '@/src/interface-adapters/controllers/skills/get-skill.controller';
import type { CreateSkillController } from '@/src/interface-adapters/controllers/skills/create-skill.controller';
import type { UpdateSkillController } from '@/src/interface-adapters/controllers/skills/update-skill.controller';
import type { DeleteSkillController } from '@/src/interface-adapters/controllers/skills/delete-skill.controller';
import type { ResolveCitationsController } from '@/src/interface-adapters/controllers/citations/resolve-citations.controller';
import type { ListDocumentsController } from '@/src/interface-adapters/controllers/documents/list-documents.controller';
import type { UploadDocumentController } from '@/src/interface-adapters/controllers/documents/upload-document.controller';
import type { GetDocumentContentController } from '@/src/interface-adapters/controllers/documents/get-document-content.controller';
import type { ListCatalogsController } from '@/src/interface-adapters/controllers/catalog/list-catalogs.controller';
import type { CreateNamespaceController } from '@/src/interface-adapters/controllers/catalog/create-namespace.controller';
import type { UpdateNamespaceDescriptionController } from '@/src/interface-adapters/controllers/catalog/update-namespace-description.controller';
import type { ListNamespacesController } from '@/src/interface-adapters/controllers/catalog/list-namespaces.controller';
import type { ListTableSnapshotsController } from '@/src/interface-adapters/controllers/catalog/list-table-snapshots.controller';
import type { ListTablesController } from '@/src/interface-adapters/controllers/catalog/list-tables.controller';
import type { LoadTableMetadataController } from '@/src/interface-adapters/controllers/catalog/load-table-metadata.controller';
import type { MonitorTablePreviewController } from '@/src/interface-adapters/controllers/catalog/monitor-table-preview.controller';
import type { PreviewTableController } from '@/src/interface-adapters/controllers/catalog/preview-table.controller';
import type { ArchiveDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/archive-database-service.controller';
import type { AttachDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/attach-database-service.controller';
import type { CdcConnectionProfileController } from '@/src/interface-adapters/controllers/database-services/cdc-connection-profile.controller';
import type { CreateDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/create-database-service.controller';
import type { GetDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/get-database-service.controller';
import type { ListDatabaseServicesController } from '@/src/interface-adapters/controllers/database-services/list-database-services.controller';
import type { ListAvailableDatabaseServicesController } from '@/src/interface-adapters/controllers/database-services/list-available-database-services.controller';
import type { ListDatabaseServiceConnectorsController } from '@/src/interface-adapters/controllers/database-services/list-database-service-connectors.controller';
import type { TestSavedDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/test-saved-database-service.controller';
import type { TestUnsavedDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/test-unsaved-database-service.controller';
import type { UpdateDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/update-database-service.controller';
import type { DetachDatabaseServiceController } from '@/src/interface-adapters/controllers/database-services/detach-database-service.controller';
import type { ArchiveConnectionController } from '@/src/interface-adapters/controllers/connections/archive-connection.controller';
import type { CreateConnectionController } from '@/src/interface-adapters/controllers/connections/create-connection.controller';
import type { GetConnectionController } from '@/src/interface-adapters/controllers/connections/get-connection.controller';
import type { ListConnectionsController } from '@/src/interface-adapters/controllers/connections/list-connections.controller';
import type { TestSavedConnectionController } from '@/src/interface-adapters/controllers/connections/test-saved-connection.controller';
import type { TestUnsavedConnectionController } from '@/src/interface-adapters/controllers/connections/test-unsaved-connection.controller';
import type { UpdateConnectionController } from '@/src/interface-adapters/controllers/connections/update-connection.controller';
import type { CancelExecutionController } from '@/src/interface-adapters/controllers/executions/cancel-execution.controller';
import type { GetExecutionLogsController } from '@/src/interface-adapters/controllers/executions/get-execution-logs.controller';
import type { GetExecutionController } from '@/src/interface-adapters/controllers/executions/get-execution.controller';
import type { ListExecutionsController } from '@/src/interface-adapters/controllers/executions/list-executions.controller';
import type { MonitorExecutionController } from '@/src/interface-adapters/controllers/executions/monitor-execution.controller';
import type { RerunExecutionController } from '@/src/interface-adapters/controllers/executions/rerun-execution.controller';
import type { GetNodeDefinitionController } from '@/src/interface-adapters/controllers/node-catalog/get-node-definition.controller';
import type { LoadNodePaletteController } from '@/src/interface-adapters/controllers/node-catalog/load-node-palette.controller';
import type { ArchivePipelineController } from '@/src/interface-adapters/controllers/pipelines/archive-pipeline.controller';
import type { ClonePipelineController } from '@/src/interface-adapters/controllers/pipelines/clone-pipeline.controller';
import type { CreatePipelineController } from '@/src/interface-adapters/controllers/pipelines/create-pipeline.controller';
import type { GetPipelineController } from '@/src/interface-adapters/controllers/pipelines/get-pipeline.controller';
import type { GetPipelineScriptController } from '@/src/interface-adapters/controllers/pipelines/get-pipeline-script.controller';
import type { ListPipelinesController } from '@/src/interface-adapters/controllers/pipelines/list-pipelines.controller';
import type { PreviewPipelineNodeController } from '@/src/interface-adapters/controllers/pipelines/preview-pipeline-node.controller';
import type { RunPipelineController } from '@/src/interface-adapters/controllers/pipelines/run-pipeline.controller';
import type { SavePipelineController } from '@/src/interface-adapters/controllers/pipelines/save-pipeline.controller';
import type { ValidatePipelineEdgeController } from '@/src/interface-adapters/controllers/pipelines/validate-pipeline-edge.controller';
import type { ValidatePipelineGraphController } from '@/src/interface-adapters/controllers/pipelines/validate-pipeline-graph.controller';
import type { CancelQueryController } from '@/src/interface-adapters/controllers/queries/cancel-query.controller';
import type { GetQueryController } from '@/src/interface-adapters/controllers/queries/get-query.controller';
import type { ListQueryCatalogsController } from '@/src/interface-adapters/controllers/queries/list-query-catalogs.controller';
import type { ListQueryHistoryController } from '@/src/interface-adapters/controllers/queries/list-query-history.controller';
import type { ListQueryNamespacesController } from '@/src/interface-adapters/controllers/queries/list-query-namespaces.controller';
import type { MonitorQueryController } from '@/src/interface-adapters/controllers/queries/monitor-query.controller';
import type { SubmitQueryController } from '@/src/interface-adapters/controllers/queries/submit-query.controller';
import type { GetScriptController } from '@/src/interface-adapters/controllers/scripts/get-script.controller';
import type { ListActiveConnectionsController } from '@/src/interface-adapters/controllers/scripts/list-active-connections.controller';
import type { ListScriptVersionsController } from '@/src/interface-adapters/controllers/scripts/list-script-versions.controller';
import type { ListScriptsController } from '@/src/interface-adapters/controllers/scripts/list-scripts.controller';
import type { LoadScriptVersionSourceController } from '@/src/interface-adapters/controllers/scripts/load-script-version-source.controller';
import type { SaveAndRunScriptController } from '@/src/interface-adapters/controllers/scripts/save-and-run-script.controller';
import type { SaveScriptController } from '@/src/interface-adapters/controllers/scripts/save-script.controller';
import type { ManageStreamAdaptersController } from '@/src/interface-adapters/controllers/streaming/manage-stream-adapters.controller';
import type { ActivateDeviceController } from '@/src/interface-adapters/controllers/devices/activate-device.controller';
import type { ListDeviceAdaptersController } from '@/src/interface-adapters/controllers/devices/list-device-adapters.controller';
import type { ListDevicesController } from '@/src/interface-adapters/controllers/devices/list-devices.controller';
import type { RegisterDeviceController } from '@/src/interface-adapters/controllers/devices/register-device.controller';
import type { RetireDeviceController } from '@/src/interface-adapters/controllers/devices/retire-device.controller';
import type { RotateDeviceCredentialController } from '@/src/interface-adapters/controllers/devices/rotate-device-credential.controller';
import type { SuspendDeviceController } from '@/src/interface-adapters/controllers/devices/suspend-device.controller';
import type { TransitionDeviceLifecycleController } from '@/src/interface-adapters/controllers/devices/transition-device-lifecycle.controller';
import type { ListDeviceLifecycleController } from '@/src/interface-adapters/controllers/devices/list-device-lifecycle.controller';
import type { ReplaceDeviceController } from '@/src/interface-adapters/controllers/devices/replace-device.controller';
import type { CreateFirmwareReleaseController } from '@/src/interface-adapters/controllers/devices/create-firmware-release.controller';
import type { ListFirmwareDeploymentsController } from '@/src/interface-adapters/controllers/devices/list-firmware-deployments.controller';
import type { ListFirmwareReleasesController } from '@/src/interface-adapters/controllers/devices/list-firmware-releases.controller';
import type { StartFirmwareDeploymentController } from '@/src/interface-adapters/controllers/devices/start-firmware-deployment.controller';
import type { CreateFirmwareCampaignController } from '@/src/interface-adapters/controllers/devices/create-firmware-campaign.controller';
import type { ListFirmwareCampaignsController } from '@/src/interface-adapters/controllers/devices/list-firmware-campaigns.controller';
import type { TransitionFirmwareCampaignController } from '@/src/interface-adapters/controllers/devices/transition-firmware-campaign.controller';
import type { ListDeviceAlertsController } from '@/src/interface-adapters/controllers/devices/list-device-alerts.controller';
import type { ListDeviceLogsController } from '@/src/interface-adapters/controllers/devices/list-device-logs.controller';
import type { AcknowledgeDeviceAlertController } from '@/src/interface-adapters/controllers/devices/acknowledge-device-alert.controller';
import type { ClearDeviceAlertController } from '@/src/interface-adapters/controllers/devices/clear-device-alert.controller';
import type { ListDeviceConfigurationsController } from '@/src/interface-adapters/controllers/devices/list-device-configurations.controller';
import type { PushDeviceConfigurationController } from '@/src/interface-adapters/controllers/devices/push-device-configuration.controller';
import type { CreateDeviceConfigurationTemplateController } from '@/src/interface-adapters/controllers/devices/create-device-configuration-template.controller';
import type { ListDeviceConfigurationTemplatesController } from '@/src/interface-adapters/controllers/devices/list-device-configuration-templates.controller';
import type { DeployDeviceConfigurationTemplateController } from '@/src/interface-adapters/controllers/devices/deploy-device-configuration-template.controller';
import type { MetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';
import type { AutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';
import type { DataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';
import type { SourceMetadataController } from '@/src/interface-adapters/controllers/metadata-crawler/source-metadata.controller';
import type { AuthController } from '@/src/interface-adapters/controllers/auth/auth.controller';
import type { AdministrationRepository } from '@/src/application/repositories/administration.repository.interface';
import type { LoadAdministrationSessionUseCase } from '@/src/application/use-cases/administration/load-administration-session.use-case';
import type { LoadAdministrationSessionController } from '@/src/interface-adapters/controllers/administration/load-administration-session.controller';
import type { LoadAdministrationGovernanceUseCase } from '@/src/application/use-cases/administration/load-administration-governance.use-case';
import type { InviteMemberUseCase } from '@/src/application/use-cases/administration/invite-member.use-case';
import type { UpdateMemberUseCase } from '@/src/application/use-cases/administration/update-member.use-case';
import type { EnableOrganizationMfaUseCase } from '@/src/application/use-cases/administration/enable-organization-mfa.use-case';
import type { RemoveAccountUseCase } from '@/src/application/use-cases/administration/remove-account.use-case';
import type { CreateAuthorizationGroupUseCase } from '@/src/application/use-cases/administration/create-authorization-group.use-case';
import type { AddAuthorizationGroupMemberUseCase } from '@/src/application/use-cases/administration/add-authorization-group-member.use-case';
import type { RemoveAuthorizationGroupMemberUseCase } from '@/src/application/use-cases/administration/remove-authorization-group-member.use-case';
import type { UpdateAuthorizationGroupFeaturesUseCase } from '@/src/application/use-cases/administration/update-authorization-group-features.use-case';
import type { CreateCatalogGrantUseCase } from '@/src/application/use-cases/administration/create-catalog-grant.use-case';
import type { DeleteCatalogGrantUseCase } from '@/src/application/use-cases/administration/delete-catalog-grant.use-case';
import type { ListServiceIdentitiesUseCase } from '@/src/application/use-cases/administration/list-service-identities.use-case';
import type { UpdateAgentServiceIdentityUseCase } from '@/src/application/use-cases/administration/update-agent-service-identity.use-case';
import type {
  ListServiceIdentitiesController,
  UpdateAgentServiceIdentityController,
} from '@/src/interface-adapters/controllers/administration/service-identities.controller';
import type {
  AddAuthorizationGroupMemberController,
  CreateAuthorizationGroupController,
  CreateCatalogGrantController,
  DeleteCatalogGrantController,
  InviteMemberController,
  LoadAdministrationGovernanceController,
  RemoveAuthorizationGroupMemberController,
  UpdateAuthorizationGroupFeaturesController,
  RemoveAccountController,
  UpdateMemberController,
  EnableOrganizationMfaController,
} from '@/src/interface-adapters/controllers/administration/administration-governance.controller';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import type { WorkspaceContextService } from '@/src/application/services/workspace-context.service.interface';
import type { ListTutorialCatalogUseCase } from '@/src/application/use-cases/tutorials/list-tutorial-catalog.use-case';
import type { OpenTutorialDetailUseCase } from '@/src/application/use-cases/tutorials/open-tutorial-detail.use-case';
import type { OpenTutorialWalkthroughUseCase } from '@/src/application/use-cases/tutorials/open-tutorial-walkthrough.use-case';
import type { StartTutorialRunUseCase } from '@/src/application/use-cases/tutorials/start-tutorial-run.use-case';
import type { AdvanceTutorialStepUseCase } from '@/src/application/use-cases/tutorials/advance-tutorial-step.use-case';
import type { PauseTutorialRunUseCase } from '@/src/application/use-cases/tutorials/pause-tutorial-run.use-case';
import type { ResumeTutorialRunUseCase } from '@/src/application/use-cases/tutorials/resume-tutorial-run.use-case';
import type { CompleteTutorialRunUseCase } from '@/src/application/use-cases/tutorials/complete-tutorial-run.use-case';
import type { RepeatTutorialUseCase } from '@/src/application/use-cases/tutorials/repeat-tutorial.use-case';
import type { ResolveOnboardingUseCase } from '@/src/application/use-cases/tutorials/resolve-onboarding.use-case';
import type { RecordOnboardingDecisionUseCase } from '@/src/application/use-cases/tutorials/record-onboarding-decision.use-case';
import type { ListTutorialCatalogController } from '@/src/interface-adapters/controllers/tutorials/list-tutorial-catalog.controller';
import type { OpenTutorialDetailController } from '@/src/interface-adapters/controllers/tutorials/open-tutorial-detail.controller';
import type { OpenTutorialWalkthroughController } from '@/src/interface-adapters/controllers/tutorials/open-tutorial-walkthrough.controller';
import type { StartTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/start-tutorial-run.controller';
import type { AdvanceTutorialStepController } from '@/src/interface-adapters/controllers/tutorials/advance-tutorial-step.controller';
import type { PauseTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/pause-tutorial-run.controller';
import type { ResumeTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/resume-tutorial-run.controller';
import type { CompleteTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/complete-tutorial-run.controller';
import type { RepeatTutorialController } from '@/src/interface-adapters/controllers/tutorials/repeat-tutorial.controller';
import type { ResolveOnboardingController } from '@/src/interface-adapters/controllers/tutorials/resolve-onboarding.controller';
import type { RecordOnboardingDecisionController } from '@/src/interface-adapters/controllers/tutorials/record-onboarding-decision.controller';

export interface DI_RETURN_TYPES {
  AuthController: AuthController;
  AdministrationRepository: AdministrationRepository;
  LoadAdministrationSessionUseCase: LoadAdministrationSessionUseCase;
  LoadAdministrationSessionController: LoadAdministrationSessionController;
  LoadAdministrationGovernanceUseCase: LoadAdministrationGovernanceUseCase;
  InviteMemberUseCase: InviteMemberUseCase;
  UpdateMemberUseCase: UpdateMemberUseCase;
  EnableOrganizationMfaUseCase: EnableOrganizationMfaUseCase;
  EnableOrganizationMfaController: EnableOrganizationMfaController;
  RemoveAccountUseCase: RemoveAccountUseCase;
  CreateAuthorizationGroupUseCase: CreateAuthorizationGroupUseCase;
  AddAuthorizationGroupMemberUseCase: AddAuthorizationGroupMemberUseCase;
  RemoveAuthorizationGroupMemberUseCase: RemoveAuthorizationGroupMemberUseCase;
  UpdateAuthorizationGroupFeaturesUseCase: UpdateAuthorizationGroupFeaturesUseCase;
  CreateCatalogGrantUseCase: CreateCatalogGrantUseCase;
  DeleteCatalogGrantUseCase: DeleteCatalogGrantUseCase;
  ListServiceIdentitiesUseCase: ListServiceIdentitiesUseCase;
  UpdateAgentServiceIdentityUseCase: UpdateAgentServiceIdentityUseCase;
  LoadAdministrationGovernanceController: LoadAdministrationGovernanceController;
  InviteMemberController: InviteMemberController;
  UpdateMemberController: UpdateMemberController;
  RemoveAccountController: RemoveAccountController;
  CreateAuthorizationGroupController: CreateAuthorizationGroupController;
  AddAuthorizationGroupMemberController: AddAuthorizationGroupMemberController;
  RemoveAuthorizationGroupMemberController: RemoveAuthorizationGroupMemberController;
  UpdateAuthorizationGroupFeaturesController: UpdateAuthorizationGroupFeaturesController;
  CreateCatalogGrantController: CreateCatalogGrantController;
  DeleteCatalogGrantController: DeleteCatalogGrantController;
  ListServiceIdentitiesController: ListServiceIdentitiesController;
  UpdateAgentServiceIdentityController: UpdateAgentServiceIdentityController;
  CoreApiClient: CoreApiClient;
  AgentApiClient: CoreApiClient;
  SchedulerService: SchedulerService;
  ExecutionProgressService: ExecutionProgressService;
  QueryProgressService: QueryProgressService;
  MessageBlockProgressService: MessageBlockProgressService;
  ChatRepository: ChatRepository;
  MessageBlockRepository: MessageBlockRepository;
  DatabaseServiceRepository: DatabaseServiceRepository;
  ConnectionRepository: ConnectionRepository;
  CatalogRepository: CatalogRepository;
  ScriptRepository: ScriptRepository;
  ExecutionRepository: ExecutionRepository;
  QueryRepository: QueryRepository;
  PipelineRepository: PipelineRepository;
  NodeCatalogRepository: NodeCatalogRepository;
  StreamingRepository: StreamingRepository;
  DeviceRepository: DeviceRepository;
  MetadataCrawlerRepository: MetadataCrawlerRepository;
  SourceMetadataRepository: SourceMetadataRepository;
  AutomationWorkflowRepository: AutomationWorkflowRepository;
  DataWorkflowRepository: DataWorkflowRepository;
  ListDatabaseServicesUseCase: ListDatabaseServicesUseCase;
  ListDatabaseServiceConnectorsUseCase: ListDatabaseServiceConnectorsUseCase;
  GetDatabaseServiceUseCase: GetDatabaseServiceUseCase;
  TestUnsavedDatabaseServiceUseCase: TestUnsavedDatabaseServiceUseCase;
  TestSavedDatabaseServiceUseCase: TestSavedDatabaseServiceUseCase;
  CreateDatabaseServiceUseCase: CreateDatabaseServiceUseCase;
  UpdateDatabaseServiceUseCase: UpdateDatabaseServiceUseCase;
  ArchiveDatabaseServiceUseCase: ArchiveDatabaseServiceUseCase;
  AttachDatabaseServiceUseCase: AttachDatabaseServiceUseCase;
  DetachDatabaseServiceUseCase: DetachDatabaseServiceUseCase;
  ListAvailableDatabaseServicesUseCase: ListAvailableDatabaseServicesUseCase;
  CdcConnectionProfileUseCases: CdcConnectionProfileUseCases;
  ListConnectionsUseCase: ListConnectionsUseCase;
  GetConnectionUseCase: GetConnectionUseCase;
  TestUnsavedConnectionUseCase: TestUnsavedConnectionUseCase;
  TestSavedConnectionUseCase: TestSavedConnectionUseCase;
  CreateConnectionUseCase: CreateConnectionUseCase;
  UpdateConnectionUseCase: UpdateConnectionUseCase;
  ArchiveConnectionUseCase: ArchiveConnectionUseCase;
  ListCatalogsUseCase: ListCatalogsUseCase;
  CreateNamespaceUseCase: CreateNamespaceUseCase;
  UpdateNamespaceDescriptionUseCase: UpdateNamespaceDescriptionUseCase;
  ListNamespacesUseCase: ListNamespacesUseCase;
  ListTablesUseCase: ListTablesUseCase;
  LoadTableMetadataUseCase: LoadTableMetadataUseCase;
  ListTableSnapshotsUseCase: ListTableSnapshotsUseCase;
  PreviewTableUseCase: PreviewTableUseCase;
  MonitorTablePreviewUseCase: MonitorTablePreviewUseCase;
  ListScriptsUseCase: ListScriptsUseCase;
  GetScriptUseCase: GetScriptUseCase;
  ListScriptVersionsUseCase: ListScriptVersionsUseCase;
  LoadScriptVersionSourceUseCase: LoadScriptVersionSourceUseCase;
  ListActiveConnectionsUseCase: ListActiveConnectionsUseCase;
  SaveScriptUseCase: SaveScriptUseCase;
  SaveAndRunScriptUseCase: SaveAndRunScriptUseCase;
  ListExecutionsUseCase: ListExecutionsUseCase;
  GetExecutionUseCase: GetExecutionUseCase;
  CancelExecutionUseCase: CancelExecutionUseCase;
  GetExecutionLogsUseCase: GetExecutionLogsUseCase;
  RerunExecutionUseCase: RerunExecutionUseCase;
  MonitorExecutionUseCase: MonitorExecutionUseCase;
  ListQueryCatalogsUseCase: ListQueryCatalogsUseCase;
  ListQueryNamespacesUseCase: ListQueryNamespacesUseCase;
  ListQueryHistoryUseCase: ListQueryHistoryUseCase;
  GetQueryUseCase: GetQueryUseCase;
  CancelQueryUseCase: CancelQueryUseCase;
  SubmitQueryUseCase: SubmitQueryUseCase;
  MonitorQueryUseCase: MonitorQueryUseCase;
  ListPipelinesUseCase: ListPipelinesUseCase;
  GetPipelineUseCase: GetPipelineUseCase;
  GetOrCompilePipelineScriptUseCase: GetOrCompilePipelineScriptUseCase;
  CreatePipelineUseCase: CreatePipelineUseCase;
  SavePipelineUseCase: SavePipelineUseCase;
  ClonePipelineUseCase: ClonePipelineUseCase;
  ArchivePipelineUseCase: ArchivePipelineUseCase;
  ValidatePipelineGraphUseCase: ValidatePipelineGraphUseCase;
  ValidatePipelineEdgeUseCase: ValidatePipelineEdgeUseCase;
  PreviewPipelineNodeUseCase: PreviewPipelineNodeUseCase;
  RunPipelineUseCase: RunPipelineUseCase;
  LoadNodePaletteUseCase: LoadNodePaletteUseCase;
  GetNodeDefinitionUseCase: GetNodeDefinitionUseCase;
  ManageStreamAdaptersUseCase: ManageStreamAdaptersUseCase;
  ListDeviceAdaptersUseCase: ListDeviceAdaptersUseCase;
  ListDevicesUseCase: ListDevicesUseCase;
  RegisterDeviceUseCase: RegisterDeviceUseCase;
  ActivateDeviceUseCase: ActivateDeviceUseCase;
  SuspendDeviceUseCase: SuspendDeviceUseCase;
  RotateDeviceCredentialUseCase: RotateDeviceCredentialUseCase;
  RetireDeviceUseCase: RetireDeviceUseCase;
  TransitionDeviceLifecycleUseCase: TransitionDeviceLifecycleUseCase;
  ListDeviceLifecycleUseCase: ListDeviceLifecycleUseCase;
  ReplaceDeviceUseCase: ReplaceDeviceUseCase;
  CreateFirmwareReleaseUseCase: CreateFirmwareReleaseUseCase;
  ListFirmwareReleasesUseCase: ListFirmwareReleasesUseCase;
  ListFirmwareDeploymentsUseCase: ListFirmwareDeploymentsUseCase;
  StartFirmwareDeploymentUseCase: StartFirmwareDeploymentUseCase;
  CreateFirmwareCampaignUseCase: CreateFirmwareCampaignUseCase;
  ListFirmwareCampaignsUseCase: ListFirmwareCampaignsUseCase;
  TransitionFirmwareCampaignUseCase: TransitionFirmwareCampaignUseCase;
  ListDeviceAlertsUseCase: ListDeviceAlertsUseCase;
  ListDeviceLogsUseCase: ListDeviceLogsUseCase;
  AcknowledgeDeviceAlertUseCase: AcknowledgeDeviceAlertUseCase;
  ClearDeviceAlertUseCase: ClearDeviceAlertUseCase;
  ListDeviceConfigurationsUseCase: ListDeviceConfigurationsUseCase;
  PushDeviceConfigurationUseCase: PushDeviceConfigurationUseCase;
  CreateDeviceConfigurationTemplateUseCase: CreateDeviceConfigurationTemplateUseCase;
  ListDeviceConfigurationTemplatesUseCase: ListDeviceConfigurationTemplatesUseCase;
  DeployDeviceConfigurationTemplateUseCase: DeployDeviceConfigurationTemplateUseCase;
  MetadataCrawlerUseCases: MetadataCrawlerUseCases;
  AutomationWorkflowUseCases: AutomationWorkflowUseCases;
  DataWorkflowUseCases: DataWorkflowUseCases;
  SourceMetadataUseCases: SourceMetadataUseCases;
  ManageChatUseCase: ManageChatUseCase;
  ListMessageBlockHistoryUseCase: ListMessageBlockHistoryUseCase;
  SubscribeMessageBlocksUseCase: SubscribeMessageBlocksUseCase;
  ListDatabaseServicesController: ListDatabaseServicesController;
  ListDatabaseServiceConnectorsController: ListDatabaseServiceConnectorsController;
  GetDatabaseServiceController: GetDatabaseServiceController;
  TestUnsavedDatabaseServiceController: TestUnsavedDatabaseServiceController;
  TestSavedDatabaseServiceController: TestSavedDatabaseServiceController;
  CreateDatabaseServiceController: CreateDatabaseServiceController;
  UpdateDatabaseServiceController: UpdateDatabaseServiceController;
  ArchiveDatabaseServiceController: ArchiveDatabaseServiceController;
  AttachDatabaseServiceController: AttachDatabaseServiceController;
  DetachDatabaseServiceController: DetachDatabaseServiceController;
  ListAvailableDatabaseServicesController: ListAvailableDatabaseServicesController;
  CdcConnectionProfileController: CdcConnectionProfileController;
  ListConnectionsController: ListConnectionsController;
  GetConnectionController: GetConnectionController;
  TestUnsavedConnectionController: TestUnsavedConnectionController;
  TestSavedConnectionController: TestSavedConnectionController;
  CreateConnectionController: CreateConnectionController;
  UpdateConnectionController: UpdateConnectionController;
  ArchiveConnectionController: ArchiveConnectionController;
  ListCatalogsController: ListCatalogsController;
  CreateNamespaceController: CreateNamespaceController;
  UpdateNamespaceDescriptionController: UpdateNamespaceDescriptionController;
  ListNamespacesController: ListNamespacesController;
  ListTablesController: ListTablesController;
  LoadTableMetadataController: LoadTableMetadataController;
  ListTableSnapshotsController: ListTableSnapshotsController;
  PreviewTableController: PreviewTableController;
  MonitorTablePreviewController: MonitorTablePreviewController;
  ListScriptsController: ListScriptsController;
  GetScriptController: GetScriptController;
  ListScriptVersionsController: ListScriptVersionsController;
  LoadScriptVersionSourceController: LoadScriptVersionSourceController;
  ListActiveConnectionsController: ListActiveConnectionsController;
  SaveScriptController: SaveScriptController;
  SaveAndRunScriptController: SaveAndRunScriptController;
  ListExecutionsController: ListExecutionsController;
  GetExecutionController: GetExecutionController;
  CancelExecutionController: CancelExecutionController;
  GetExecutionLogsController: GetExecutionLogsController;
  RerunExecutionController: RerunExecutionController;
  MonitorExecutionController: MonitorExecutionController;
  ListQueryCatalogsController: ListQueryCatalogsController;
  ListQueryNamespacesController: ListQueryNamespacesController;
  ListQueryHistoryController: ListQueryHistoryController;
  GetQueryController: GetQueryController;
  CancelQueryController: CancelQueryController;
  SubmitQueryController: SubmitQueryController;
  MonitorQueryController: MonitorQueryController;
  ListPipelinesController: ListPipelinesController;
  GetPipelineController: GetPipelineController;
  GetPipelineScriptController: GetPipelineScriptController;
  CreatePipelineController: CreatePipelineController;
  SavePipelineController: SavePipelineController;
  ClonePipelineController: ClonePipelineController;
  ArchivePipelineController: ArchivePipelineController;
  ValidatePipelineGraphController: ValidatePipelineGraphController;
  ValidatePipelineEdgeController: ValidatePipelineEdgeController;
  PreviewPipelineNodeController: PreviewPipelineNodeController;
  RunPipelineController: RunPipelineController;
  LoadNodePaletteController: LoadNodePaletteController;
  GetNodeDefinitionController: GetNodeDefinitionController;
  ManageStreamAdaptersController: ManageStreamAdaptersController;
  ListDeviceAdaptersController: ListDeviceAdaptersController;
  ListDevicesController: ListDevicesController;
  RegisterDeviceController: RegisterDeviceController;
  ActivateDeviceController: ActivateDeviceController;
  SuspendDeviceController: SuspendDeviceController;
  RotateDeviceCredentialController: RotateDeviceCredentialController;
  RetireDeviceController: RetireDeviceController;
  TransitionDeviceLifecycleController: TransitionDeviceLifecycleController;
  ListDeviceLifecycleController: ListDeviceLifecycleController;
  ReplaceDeviceController: ReplaceDeviceController;
  CreateFirmwareReleaseController: CreateFirmwareReleaseController;
  ListFirmwareReleasesController: ListFirmwareReleasesController;
  ListFirmwareDeploymentsController: ListFirmwareDeploymentsController;
  StartFirmwareDeploymentController: StartFirmwareDeploymentController;
  CreateFirmwareCampaignController: CreateFirmwareCampaignController;
  ListFirmwareCampaignsController: ListFirmwareCampaignsController;
  TransitionFirmwareCampaignController: TransitionFirmwareCampaignController;
  ListDeviceAlertsController: ListDeviceAlertsController;
  ListDeviceLogsController: ListDeviceLogsController;
  AcknowledgeDeviceAlertController: AcknowledgeDeviceAlertController;
  ClearDeviceAlertController: ClearDeviceAlertController;
  ListDeviceConfigurationsController: ListDeviceConfigurationsController;
  PushDeviceConfigurationController: PushDeviceConfigurationController;
  CreateDeviceConfigurationTemplateController: CreateDeviceConfigurationTemplateController;
  ListDeviceConfigurationTemplatesController: ListDeviceConfigurationTemplatesController;
  DeployDeviceConfigurationTemplateController: DeployDeviceConfigurationTemplateController;
  MetadataCrawlerController: MetadataCrawlerController;
  AutomationWorkflowController: AutomationWorkflowController;
  DataWorkflowController: DataWorkflowController;
  SourceMetadataController: SourceMetadataController;
  ManageChatController: ManageChatController;
  ListMessageBlockHistoryController: ListMessageBlockHistoryController;
  SubscribeMessageBlocksController: SubscribeMessageBlocksController;
  ChartRepository: ChartRepository;
  CanonicalChartRepository: CanonicalChartRepository;
  ChartCollectionRepository: ChartCollectionRepository;
  ChartEncodingSuggestionRepository: ChartEncodingSuggestionRepository;
  ChartProgressService: ChartProgressService;
  ChartRendererService: ChartRendererService;
  ListChartsUseCase: ListChartsUseCase;
  SubscribeChartsUseCase: SubscribeChartsUseCase;
  CreateChartUseCase: CreateChartUseCase;
  PatchChartUseCase: PatchChartUseCase;
  DeleteChartUseCase: DeleteChartUseCase;
  SetChartDataFromCsvUseCase: SetChartDataFromCsvUseCase;
  SuggestChartEncodingsUseCase: SuggestChartEncodingsUseCase;
  PreviewCanonicalChartUseCase: PreviewCanonicalChartUseCase;
  PreviewCanonicalChartQueryUseCase: PreviewCanonicalChartQueryUseCase;
  CompileCanonicalChartQueryUseCase: CompileCanonicalChartQueryUseCase;
  CreateCanonicalChartUseCase: CreateCanonicalChartUseCase;
  GetCanonicalChartUseCase: GetCanonicalChartUseCase;
  RunSavedCanonicalChartUseCase: RunSavedCanonicalChartUseCase;
  ListCanonicalChartsUseCase: ListCanonicalChartsUseCase;
  UpdateCanonicalChartUseCase: UpdateCanonicalChartUseCase;
  ListCanonicalChartRevisionsUseCase: ListCanonicalChartRevisionsUseCase;
  RestoreCanonicalChartRevisionUseCase: RestoreCanonicalChartRevisionUseCase;
  CancelCanonicalChartRunUseCase: CancelCanonicalChartRunUseCase;
  SaveAsNewCanonicalChartUseCase: SaveAsNewCanonicalChartUseCase;
  SaveChatChartPreviewUseCase: SaveChatChartPreviewUseCase;
  ListChartCollectionsUseCase: ListChartCollectionsUseCase;
  ChartCollectionUseCases: ChartCollectionUseCases;
  ListChartCollectionsController: ListChartCollectionsController;
  CreateChartCollectionController: CreateChartCollectionController;
  UpdateChartCollectionController: UpdateChartCollectionController;
  MoveChartCollectionController: MoveChartCollectionController;
  ArchiveChartCollectionController: ArchiveChartCollectionController;
  DashboardRepository: DashboardRepository;
  DashboardRuntimeService: DashboardRuntimeService;
  CreateDashboardUseCase: CreateDashboardUseCase;
  GetDashboardUseCase: GetDashboardUseCase;
  ListDashboardsUseCase: ListDashboardsUseCase;
  SaveDashboardUseCase: SaveDashboardUseCase;
  CopyDashboardUseCase: CopyDashboardUseCase;
  ArchiveDashboardUseCase: ArchiveDashboardUseCase;
  ExecuteDashboardUseCase: ExecuteDashboardUseCase;
  ListDashboardFilterTargetsUseCase: ListDashboardFilterTargetsUseCase;
  CreateDashboardController: CreateDashboardController;
  GetDashboardController: GetDashboardController;
  ListDashboardsController: ListDashboardsController;
  SaveDashboardController: SaveDashboardController;
  CopyDashboardController: CopyDashboardController;
  ArchiveDashboardController: ArchiveDashboardController;
  ExecuteDashboardController: ExecuteDashboardController;
  ListDashboardFilterTargetsController: ListDashboardFilterTargetsController;
  PlantModelRepository: PlantModelRepository;
  PlantModelUseCases: PlantModelUseCases;
  PlantModelController: PlantModelController;
  PlantWalkthroughService: PlantWalkthroughService;
  PlantWalkthroughUseCases: PlantWalkthroughUseCases;
  PlantWalkthroughController: PlantWalkthroughController;
  ListChartsController: ListChartsController;
  SubscribeChartsController: SubscribeChartsController;
  CreateChartController: CreateChartController;
  PatchChartController: PatchChartController;
  DeleteChartController: DeleteChartController;
  SetChartDataFromCsvController: SetChartDataFromCsvController;
  SuggestChartEncodingsController: SuggestChartEncodingsController;
  PreviewCanonicalChartController: PreviewCanonicalChartController;
  PreviewCanonicalChartQueryController: PreviewCanonicalChartQueryController;
  CompileCanonicalChartQueryController: CompileCanonicalChartQueryController;
  CreateCanonicalChartController: CreateCanonicalChartController;
  GetCanonicalChartController: GetCanonicalChartController;
  RunSavedCanonicalChartController: RunSavedCanonicalChartController;
  ListCanonicalChartsController: ListCanonicalChartsController;
  UpdateCanonicalChartController: UpdateCanonicalChartController;
  ListCanonicalChartRevisionsController: ListCanonicalChartRevisionsController;
  RestoreCanonicalChartRevisionController: RestoreCanonicalChartRevisionController;
  CancelCanonicalChartRunController: CancelCanonicalChartRunController;
  SaveAsNewCanonicalChartController: SaveAsNewCanonicalChartController;
  SaveChatChartPreviewController: SaveChatChartPreviewController;
  PendingActionRepository: PendingActionRepository;
  ListPendingActionsUseCase: ListPendingActionsUseCase;
  GetPendingActionUseCase: GetPendingActionUseCase;
  ApprovePendingActionUseCase: ApprovePendingActionUseCase;
  RejectPendingActionUseCase: RejectPendingActionUseCase;
  ListPendingActionsController: ListPendingActionsController;
  GetPendingActionController: GetPendingActionController;
  ApprovePendingActionController: ApprovePendingActionController;
  RejectPendingActionController: RejectPendingActionController;
  ActionCatalogRepository: ActionCatalogRepository;
  ListActionCatalogUseCase: ListActionCatalogUseCase;
  ListActionCatalogController: ListActionCatalogController;
  AgentManifestRepository: AgentManifestRepository;
  ListAgentManifestsUseCase: ListAgentManifestsUseCase;
  GetAgentManifestUseCase: GetAgentManifestUseCase;
  SaveAgentManifestUseCase: SaveAgentManifestUseCase;
  ValidateAgentManifestUseCase: ValidateAgentManifestUseCase;
  DeleteAgentManifestUseCase: DeleteAgentManifestUseCase;
  ListAgentManifestsController: ListAgentManifestsController;
  GetAgentManifestController: GetAgentManifestController;
  SaveAgentManifestController: SaveAgentManifestController;
  ValidateAgentManifestController: ValidateAgentManifestController;
  DeleteAgentManifestController: DeleteAgentManifestController;
  SkillRepository: SkillRepository;
  ListSkillsUseCase: ListSkillsUseCase;
  GetSkillUseCase: GetSkillUseCase;
  CreateSkillUseCase: CreateSkillUseCase;
  UpdateSkillUseCase: UpdateSkillUseCase;
  DeleteSkillUseCase: DeleteSkillUseCase;
  ListSkillsController: ListSkillsController;
  GetSkillController: GetSkillController;
  CreateSkillController: CreateSkillController;
  UpdateSkillController: UpdateSkillController;
  DeleteSkillController: DeleteSkillController;
  CitationRepository: CitationRepository;
  ResolveCitationsUseCase: ResolveCitationsUseCase;
  ResolveCitationsController: ResolveCitationsController;
  DocumentRepository: DocumentRepository;
  WorkspaceTreeRepository: WorkspaceTreeRepository;
  ListWorkspaceTreeUseCase: ListWorkspaceTreeUseCase;
  GetWorkspaceFileContentUseCase: GetWorkspaceFileContentUseCase;
  ListWorkspaceTreeController: ListWorkspaceTreeController;
  GetWorkspaceFileContentController: GetWorkspaceFileContentController;
  ListDocumentsUseCase: ListDocumentsUseCase;
  UploadDocumentUseCase: UploadDocumentUseCase;
  GetDocumentContentUseCase: GetDocumentContentUseCase;
  ListDocumentsController: ListDocumentsController;
  UploadDocumentController: UploadDocumentController;
  GetDocumentContentController: GetDocumentContentController;
  TutorialRepository: TutorialRepository;
  TutorialProgressRepository: TutorialProgressRepository;
  TutorialFeatureAccessService: TutorialFeatureAccessService;
  WorkspaceContextService: WorkspaceContextService;
  ListTutorialCatalogUseCase: ListTutorialCatalogUseCase;
  OpenTutorialDetailUseCase: OpenTutorialDetailUseCase;
  OpenTutorialWalkthroughUseCase: OpenTutorialWalkthroughUseCase;
  StartTutorialRunUseCase: StartTutorialRunUseCase;
  AdvanceTutorialStepUseCase: AdvanceTutorialStepUseCase;
  PauseTutorialRunUseCase: PauseTutorialRunUseCase;
  ResumeTutorialRunUseCase: ResumeTutorialRunUseCase;
  CompleteTutorialRunUseCase: CompleteTutorialRunUseCase;
  RepeatTutorialUseCase: RepeatTutorialUseCase;
  ResolveOnboardingUseCase: ResolveOnboardingUseCase;
  RecordOnboardingDecisionUseCase: RecordOnboardingDecisionUseCase;
  ListTutorialCatalogController: ListTutorialCatalogController;
  OpenTutorialDetailController: OpenTutorialDetailController;
  OpenTutorialWalkthroughController: OpenTutorialWalkthroughController;
  StartTutorialRunController: StartTutorialRunController;
  AdvanceTutorialStepController: AdvanceTutorialStepController;
  PauseTutorialRunController: PauseTutorialRunController;
  ResumeTutorialRunController: ResumeTutorialRunController;
  CompleteTutorialRunController: CompleteTutorialRunController;
  RepeatTutorialController: RepeatTutorialController;
  ResolveOnboardingController: ResolveOnboardingController;
  RecordOnboardingDecisionController: RecordOnboardingDecisionController;
}

declare const injectionTokenKey: unique symbol;

export type InjectionToken<TKey extends keyof DI_RETURN_TYPES> = symbol & {
  readonly [injectionTokenKey]: TKey;
};

const createSymbol = <TName extends keyof DI_RETURN_TYPES>(name: TName): InjectionToken<TName> =>
  Symbol.for(`celesnity.${name}`) as InjectionToken<TName>;

export const DI_SYMBOLS = {
  AuthController: createSymbol('AuthController'),
  AdministrationRepository: createSymbol('AdministrationRepository'),
  LoadAdministrationSessionUseCase: createSymbol('LoadAdministrationSessionUseCase'),
  LoadAdministrationSessionController: createSymbol('LoadAdministrationSessionController'),
  LoadAdministrationGovernanceUseCase: createSymbol('LoadAdministrationGovernanceUseCase'),
  InviteMemberUseCase: createSymbol('InviteMemberUseCase'),
  UpdateMemberUseCase: createSymbol('UpdateMemberUseCase'),
  EnableOrganizationMfaUseCase: createSymbol('EnableOrganizationMfaUseCase'),
  EnableOrganizationMfaController: createSymbol('EnableOrganizationMfaController'),
  RemoveAccountUseCase: createSymbol('RemoveAccountUseCase'),
  CreateAuthorizationGroupUseCase: createSymbol('CreateAuthorizationGroupUseCase'),
  AddAuthorizationGroupMemberUseCase: createSymbol('AddAuthorizationGroupMemberUseCase'),
  RemoveAuthorizationGroupMemberUseCase: createSymbol('RemoveAuthorizationGroupMemberUseCase'),
  UpdateAuthorizationGroupFeaturesUseCase: createSymbol('UpdateAuthorizationGroupFeaturesUseCase'),
  CreateCatalogGrantUseCase: createSymbol('CreateCatalogGrantUseCase'),
  DeleteCatalogGrantUseCase: createSymbol('DeleteCatalogGrantUseCase'),
  ListServiceIdentitiesUseCase: createSymbol('ListServiceIdentitiesUseCase'),
  UpdateAgentServiceIdentityUseCase: createSymbol('UpdateAgentServiceIdentityUseCase'),
  LoadAdministrationGovernanceController: createSymbol('LoadAdministrationGovernanceController'),
  InviteMemberController: createSymbol('InviteMemberController'),
  UpdateMemberController: createSymbol('UpdateMemberController'),
  RemoveAccountController: createSymbol('RemoveAccountController'),
  CreateAuthorizationGroupController: createSymbol('CreateAuthorizationGroupController'),
  AddAuthorizationGroupMemberController: createSymbol('AddAuthorizationGroupMemberController'),
  RemoveAuthorizationGroupMemberController: createSymbol(
    'RemoveAuthorizationGroupMemberController',
  ),
  UpdateAuthorizationGroupFeaturesController: createSymbol(
    'UpdateAuthorizationGroupFeaturesController',
  ),
  CreateCatalogGrantController: createSymbol('CreateCatalogGrantController'),
  DeleteCatalogGrantController: createSymbol('DeleteCatalogGrantController'),
  ListServiceIdentitiesController: createSymbol('ListServiceIdentitiesController'),
  UpdateAgentServiceIdentityController: createSymbol('UpdateAgentServiceIdentityController'),
  CoreApiClient: createSymbol('CoreApiClient'),
  AgentApiClient: createSymbol('AgentApiClient'),
  SchedulerService: createSymbol('SchedulerService'),
  ExecutionProgressService: createSymbol('ExecutionProgressService'),
  QueryProgressService: createSymbol('QueryProgressService'),
  DatabaseServiceRepository: createSymbol('DatabaseServiceRepository'),
  ConnectionRepository: createSymbol('ConnectionRepository'),
  CatalogRepository: createSymbol('CatalogRepository'),
  ScriptRepository: createSymbol('ScriptRepository'),
  ExecutionRepository: createSymbol('ExecutionRepository'),
  QueryRepository: createSymbol('QueryRepository'),
  PipelineRepository: createSymbol('PipelineRepository'),
  NodeCatalogRepository: createSymbol('NodeCatalogRepository'),
  StreamingRepository: createSymbol('StreamingRepository'),
  DeviceRepository: createSymbol('DeviceRepository'),
  MetadataCrawlerRepository: createSymbol('MetadataCrawlerRepository'),
  AutomationWorkflowRepository: createSymbol('AutomationWorkflowRepository'),
  DataWorkflowRepository: createSymbol('DataWorkflowRepository'),
  SourceMetadataRepository: createSymbol('SourceMetadataRepository'),
  ChatRepository: createSymbol('ChatRepository'),
  ListDatabaseServicesUseCase: createSymbol('ListDatabaseServicesUseCase'),
  ListDatabaseServiceConnectorsUseCase: createSymbol('ListDatabaseServiceConnectorsUseCase'),
  GetDatabaseServiceUseCase: createSymbol('GetDatabaseServiceUseCase'),
  TestUnsavedDatabaseServiceUseCase: createSymbol('TestUnsavedDatabaseServiceUseCase'),
  TestSavedDatabaseServiceUseCase: createSymbol('TestSavedDatabaseServiceUseCase'),
  CreateDatabaseServiceUseCase: createSymbol('CreateDatabaseServiceUseCase'),
  UpdateDatabaseServiceUseCase: createSymbol('UpdateDatabaseServiceUseCase'),
  ArchiveDatabaseServiceUseCase: createSymbol('ArchiveDatabaseServiceUseCase'),
  AttachDatabaseServiceUseCase: createSymbol('AttachDatabaseServiceUseCase'),
  DetachDatabaseServiceUseCase: createSymbol('DetachDatabaseServiceUseCase'),
  ListAvailableDatabaseServicesUseCase: createSymbol('ListAvailableDatabaseServicesUseCase'),
  CdcConnectionProfileUseCases: createSymbol('CdcConnectionProfileUseCases'),
  ListConnectionsUseCase: createSymbol('ListConnectionsUseCase'),
  GetConnectionUseCase: createSymbol('GetConnectionUseCase'),
  TestUnsavedConnectionUseCase: createSymbol('TestUnsavedConnectionUseCase'),
  TestSavedConnectionUseCase: createSymbol('TestSavedConnectionUseCase'),
  CreateConnectionUseCase: createSymbol('CreateConnectionUseCase'),
  UpdateConnectionUseCase: createSymbol('UpdateConnectionUseCase'),
  ArchiveConnectionUseCase: createSymbol('ArchiveConnectionUseCase'),
  ListCatalogsUseCase: createSymbol('ListCatalogsUseCase'),
  CreateNamespaceUseCase: createSymbol('CreateNamespaceUseCase'),
  UpdateNamespaceDescriptionUseCase: createSymbol('UpdateNamespaceDescriptionUseCase'),
  ListNamespacesUseCase: createSymbol('ListNamespacesUseCase'),
  ListTablesUseCase: createSymbol('ListTablesUseCase'),
  LoadTableMetadataUseCase: createSymbol('LoadTableMetadataUseCase'),
  ListTableSnapshotsUseCase: createSymbol('ListTableSnapshotsUseCase'),
  PreviewTableUseCase: createSymbol('PreviewTableUseCase'),
  MonitorTablePreviewUseCase: createSymbol('MonitorTablePreviewUseCase'),
  ListScriptsUseCase: createSymbol('ListScriptsUseCase'),
  GetScriptUseCase: createSymbol('GetScriptUseCase'),
  ListScriptVersionsUseCase: createSymbol('ListScriptVersionsUseCase'),
  LoadScriptVersionSourceUseCase: createSymbol('LoadScriptVersionSourceUseCase'),
  ListActiveConnectionsUseCase: createSymbol('ListActiveConnectionsUseCase'),
  SaveScriptUseCase: createSymbol('SaveScriptUseCase'),
  SaveAndRunScriptUseCase: createSymbol('SaveAndRunScriptUseCase'),
  ListExecutionsUseCase: createSymbol('ListExecutionsUseCase'),
  GetExecutionUseCase: createSymbol('GetExecutionUseCase'),
  CancelExecutionUseCase: createSymbol('CancelExecutionUseCase'),
  GetExecutionLogsUseCase: createSymbol('GetExecutionLogsUseCase'),
  RerunExecutionUseCase: createSymbol('RerunExecutionUseCase'),
  MonitorExecutionUseCase: createSymbol('MonitorExecutionUseCase'),
  ListQueryCatalogsUseCase: createSymbol('ListQueryCatalogsUseCase'),
  ListQueryNamespacesUseCase: createSymbol('ListQueryNamespacesUseCase'),
  ListQueryHistoryUseCase: createSymbol('ListQueryHistoryUseCase'),
  GetQueryUseCase: createSymbol('GetQueryUseCase'),
  CancelQueryUseCase: createSymbol('CancelQueryUseCase'),
  SubmitQueryUseCase: createSymbol('SubmitQueryUseCase'),
  MonitorQueryUseCase: createSymbol('MonitorQueryUseCase'),
  ListPipelinesUseCase: createSymbol('ListPipelinesUseCase'),
  GetPipelineUseCase: createSymbol('GetPipelineUseCase'),
  GetOrCompilePipelineScriptUseCase: createSymbol('GetOrCompilePipelineScriptUseCase'),
  CreatePipelineUseCase: createSymbol('CreatePipelineUseCase'),
  SavePipelineUseCase: createSymbol('SavePipelineUseCase'),
  ClonePipelineUseCase: createSymbol('ClonePipelineUseCase'),
  ArchivePipelineUseCase: createSymbol('ArchivePipelineUseCase'),
  ValidatePipelineGraphUseCase: createSymbol('ValidatePipelineGraphUseCase'),
  ValidatePipelineEdgeUseCase: createSymbol('ValidatePipelineEdgeUseCase'),
  PreviewPipelineNodeUseCase: createSymbol('PreviewPipelineNodeUseCase'),
  RunPipelineUseCase: createSymbol('RunPipelineUseCase'),
  LoadNodePaletteUseCase: createSymbol('LoadNodePaletteUseCase'),
  GetNodeDefinitionUseCase: createSymbol('GetNodeDefinitionUseCase'),
  ManageStreamAdaptersUseCase: createSymbol('ManageStreamAdaptersUseCase'),
  ListDeviceAdaptersUseCase: createSymbol('ListDeviceAdaptersUseCase'),
  ListDevicesUseCase: createSymbol('ListDevicesUseCase'),
  RegisterDeviceUseCase: createSymbol('RegisterDeviceUseCase'),
  ActivateDeviceUseCase: createSymbol('ActivateDeviceUseCase'),
  SuspendDeviceUseCase: createSymbol('SuspendDeviceUseCase'),
  RotateDeviceCredentialUseCase: createSymbol('RotateDeviceCredentialUseCase'),
  RetireDeviceUseCase: createSymbol('RetireDeviceUseCase'),
  TransitionDeviceLifecycleUseCase: createSymbol('TransitionDeviceLifecycleUseCase'),
  ListDeviceLifecycleUseCase: createSymbol('ListDeviceLifecycleUseCase'),
  ReplaceDeviceUseCase: createSymbol('ReplaceDeviceUseCase'),
  CreateFirmwareReleaseUseCase: createSymbol('CreateFirmwareReleaseUseCase'),
  ListFirmwareReleasesUseCase: createSymbol('ListFirmwareReleasesUseCase'),
  ListFirmwareDeploymentsUseCase: createSymbol('ListFirmwareDeploymentsUseCase'),
  StartFirmwareDeploymentUseCase: createSymbol('StartFirmwareDeploymentUseCase'),
  CreateFirmwareCampaignUseCase: createSymbol('CreateFirmwareCampaignUseCase'),
  ListFirmwareCampaignsUseCase: createSymbol('ListFirmwareCampaignsUseCase'),
  TransitionFirmwareCampaignUseCase: createSymbol('TransitionFirmwareCampaignUseCase'),
  ListDeviceAlertsUseCase: createSymbol('ListDeviceAlertsUseCase'),
  ListDeviceLogsUseCase: createSymbol('ListDeviceLogsUseCase'),
  AcknowledgeDeviceAlertUseCase: createSymbol('AcknowledgeDeviceAlertUseCase'),
  ClearDeviceAlertUseCase: createSymbol('ClearDeviceAlertUseCase'),
  ListDeviceConfigurationsUseCase: createSymbol('ListDeviceConfigurationsUseCase'),
  PushDeviceConfigurationUseCase: createSymbol('PushDeviceConfigurationUseCase'),
  CreateDeviceConfigurationTemplateUseCase: createSymbol(
    'CreateDeviceConfigurationTemplateUseCase',
  ),
  ListDeviceConfigurationTemplatesUseCase: createSymbol('ListDeviceConfigurationTemplatesUseCase'),
  DeployDeviceConfigurationTemplateUseCase: createSymbol(
    'DeployDeviceConfigurationTemplateUseCase',
  ),
  MetadataCrawlerUseCases: createSymbol('MetadataCrawlerUseCases'),
  AutomationWorkflowUseCases: createSymbol('AutomationWorkflowUseCases'),
  DataWorkflowUseCases: createSymbol('DataWorkflowUseCases'),
  SourceMetadataUseCases: createSymbol('SourceMetadataUseCases'),
  ManageChatUseCase: createSymbol('ManageChatUseCase'),
  ListDatabaseServicesController: createSymbol('ListDatabaseServicesController'),
  ListDatabaseServiceConnectorsController: createSymbol('ListDatabaseServiceConnectorsController'),
  GetDatabaseServiceController: createSymbol('GetDatabaseServiceController'),
  TestUnsavedDatabaseServiceController: createSymbol('TestUnsavedDatabaseServiceController'),
  TestSavedDatabaseServiceController: createSymbol('TestSavedDatabaseServiceController'),
  CreateDatabaseServiceController: createSymbol('CreateDatabaseServiceController'),
  UpdateDatabaseServiceController: createSymbol('UpdateDatabaseServiceController'),
  ArchiveDatabaseServiceController: createSymbol('ArchiveDatabaseServiceController'),
  AttachDatabaseServiceController: createSymbol('AttachDatabaseServiceController'),
  DetachDatabaseServiceController: createSymbol('DetachDatabaseServiceController'),
  ListAvailableDatabaseServicesController: createSymbol('ListAvailableDatabaseServicesController'),
  CdcConnectionProfileController: createSymbol('CdcConnectionProfileController'),
  ListConnectionsController: createSymbol('ListConnectionsController'),
  GetConnectionController: createSymbol('GetConnectionController'),
  TestUnsavedConnectionController: createSymbol('TestUnsavedConnectionController'),
  TestSavedConnectionController: createSymbol('TestSavedConnectionController'),
  CreateConnectionController: createSymbol('CreateConnectionController'),
  UpdateConnectionController: createSymbol('UpdateConnectionController'),
  ArchiveConnectionController: createSymbol('ArchiveConnectionController'),
  ListCatalogsController: createSymbol('ListCatalogsController'),
  CreateNamespaceController: createSymbol('CreateNamespaceController'),
  UpdateNamespaceDescriptionController: createSymbol('UpdateNamespaceDescriptionController'),
  ListNamespacesController: createSymbol('ListNamespacesController'),
  ListTablesController: createSymbol('ListTablesController'),
  LoadTableMetadataController: createSymbol('LoadTableMetadataController'),
  ListTableSnapshotsController: createSymbol('ListTableSnapshotsController'),
  PreviewTableController: createSymbol('PreviewTableController'),
  MonitorTablePreviewController: createSymbol('MonitorTablePreviewController'),
  ListScriptsController: createSymbol('ListScriptsController'),
  GetScriptController: createSymbol('GetScriptController'),
  ListScriptVersionsController: createSymbol('ListScriptVersionsController'),
  LoadScriptVersionSourceController: createSymbol('LoadScriptVersionSourceController'),
  ListActiveConnectionsController: createSymbol('ListActiveConnectionsController'),
  SaveScriptController: createSymbol('SaveScriptController'),
  SaveAndRunScriptController: createSymbol('SaveAndRunScriptController'),
  ListExecutionsController: createSymbol('ListExecutionsController'),
  GetExecutionController: createSymbol('GetExecutionController'),
  CancelExecutionController: createSymbol('CancelExecutionController'),
  GetExecutionLogsController: createSymbol('GetExecutionLogsController'),
  RerunExecutionController: createSymbol('RerunExecutionController'),
  MonitorExecutionController: createSymbol('MonitorExecutionController'),
  ListQueryCatalogsController: createSymbol('ListQueryCatalogsController'),
  ListQueryNamespacesController: createSymbol('ListQueryNamespacesController'),
  ListQueryHistoryController: createSymbol('ListQueryHistoryController'),
  GetQueryController: createSymbol('GetQueryController'),
  CancelQueryController: createSymbol('CancelQueryController'),
  SubmitQueryController: createSymbol('SubmitQueryController'),
  MonitorQueryController: createSymbol('MonitorQueryController'),
  ListPipelinesController: createSymbol('ListPipelinesController'),
  GetPipelineController: createSymbol('GetPipelineController'),
  GetPipelineScriptController: createSymbol('GetPipelineScriptController'),
  CreatePipelineController: createSymbol('CreatePipelineController'),
  SavePipelineController: createSymbol('SavePipelineController'),
  ClonePipelineController: createSymbol('ClonePipelineController'),
  ArchivePipelineController: createSymbol('ArchivePipelineController'),
  ValidatePipelineGraphController: createSymbol('ValidatePipelineGraphController'),
  ValidatePipelineEdgeController: createSymbol('ValidatePipelineEdgeController'),
  PreviewPipelineNodeController: createSymbol('PreviewPipelineNodeController'),
  RunPipelineController: createSymbol('RunPipelineController'),
  LoadNodePaletteController: createSymbol('LoadNodePaletteController'),
  GetNodeDefinitionController: createSymbol('GetNodeDefinitionController'),
  ManageStreamAdaptersController: createSymbol('ManageStreamAdaptersController'),
  ListDeviceAdaptersController: createSymbol('ListDeviceAdaptersController'),
  ListDevicesController: createSymbol('ListDevicesController'),
  RegisterDeviceController: createSymbol('RegisterDeviceController'),
  ActivateDeviceController: createSymbol('ActivateDeviceController'),
  SuspendDeviceController: createSymbol('SuspendDeviceController'),
  RotateDeviceCredentialController: createSymbol('RotateDeviceCredentialController'),
  RetireDeviceController: createSymbol('RetireDeviceController'),
  TransitionDeviceLifecycleController: createSymbol('TransitionDeviceLifecycleController'),
  ListDeviceLifecycleController: createSymbol('ListDeviceLifecycleController'),
  ReplaceDeviceController: createSymbol('ReplaceDeviceController'),
  CreateFirmwareReleaseController: createSymbol('CreateFirmwareReleaseController'),
  ListFirmwareReleasesController: createSymbol('ListFirmwareReleasesController'),
  ListFirmwareDeploymentsController: createSymbol('ListFirmwareDeploymentsController'),
  StartFirmwareDeploymentController: createSymbol('StartFirmwareDeploymentController'),
  CreateFirmwareCampaignController: createSymbol('CreateFirmwareCampaignController'),
  ListFirmwareCampaignsController: createSymbol('ListFirmwareCampaignsController'),
  TransitionFirmwareCampaignController: createSymbol('TransitionFirmwareCampaignController'),
  ListDeviceAlertsController: createSymbol('ListDeviceAlertsController'),
  ListDeviceLogsController: createSymbol('ListDeviceLogsController'),
  AcknowledgeDeviceAlertController: createSymbol('AcknowledgeDeviceAlertController'),
  ClearDeviceAlertController: createSymbol('ClearDeviceAlertController'),
  ListDeviceConfigurationsController: createSymbol('ListDeviceConfigurationsController'),
  PushDeviceConfigurationController: createSymbol('PushDeviceConfigurationController'),
  CreateDeviceConfigurationTemplateController: createSymbol(
    'CreateDeviceConfigurationTemplateController',
  ),
  ListDeviceConfigurationTemplatesController: createSymbol(
    'ListDeviceConfigurationTemplatesController',
  ),
  DeployDeviceConfigurationTemplateController: createSymbol(
    'DeployDeviceConfigurationTemplateController',
  ),
  MetadataCrawlerController: createSymbol('MetadataCrawlerController'),
  AutomationWorkflowController: createSymbol('AutomationWorkflowController'),
  DataWorkflowController: createSymbol('DataWorkflowController'),
  SourceMetadataController: createSymbol('SourceMetadataController'),
  ManageChatController: createSymbol('ManageChatController'),
  WorkspaceTreeRepository: createSymbol('WorkspaceTreeRepository'),
  ListWorkspaceTreeUseCase: createSymbol('ListWorkspaceTreeUseCase'),
  GetWorkspaceFileContentUseCase: createSymbol('GetWorkspaceFileContentUseCase'),
  ListWorkspaceTreeController: createSymbol('ListWorkspaceTreeController'),
  GetWorkspaceFileContentController: createSymbol('GetWorkspaceFileContentController'),
  MessageBlockRepository: createSymbol('MessageBlockRepository'),
  MessageBlockProgressService: createSymbol('MessageBlockProgressService'),
  ListMessageBlockHistoryUseCase: createSymbol('ListMessageBlockHistoryUseCase'),
  SubscribeMessageBlocksUseCase: createSymbol('SubscribeMessageBlocksUseCase'),
  ListMessageBlockHistoryController: createSymbol('ListMessageBlockHistoryController'),
  SubscribeMessageBlocksController: createSymbol('SubscribeMessageBlocksController'),
  ChartRepository: createSymbol('ChartRepository'),
  CanonicalChartRepository: createSymbol('CanonicalChartRepository'),
  ChartCollectionRepository: createSymbol('ChartCollectionRepository'),
  ChartEncodingSuggestionRepository: createSymbol('ChartEncodingSuggestionRepository'),
  ChartProgressService: createSymbol('ChartProgressService'),
  ChartRendererService: createSymbol('ChartRendererService'),
  ListChartsUseCase: createSymbol('ListChartsUseCase'),
  SubscribeChartsUseCase: createSymbol('SubscribeChartsUseCase'),
  CreateChartUseCase: createSymbol('CreateChartUseCase'),
  PatchChartUseCase: createSymbol('PatchChartUseCase'),
  DeleteChartUseCase: createSymbol('DeleteChartUseCase'),
  SetChartDataFromCsvUseCase: createSymbol('SetChartDataFromCsvUseCase'),
  SuggestChartEncodingsUseCase: createSymbol('SuggestChartEncodingsUseCase'),
  PreviewCanonicalChartUseCase: createSymbol('PreviewCanonicalChartUseCase'),
  PreviewCanonicalChartQueryUseCase: createSymbol('PreviewCanonicalChartQueryUseCase'),
  CompileCanonicalChartQueryUseCase: createSymbol('CompileCanonicalChartQueryUseCase'),
  CreateCanonicalChartUseCase: createSymbol('CreateCanonicalChartUseCase'),
  GetCanonicalChartUseCase: createSymbol('GetCanonicalChartUseCase'),
  RunSavedCanonicalChartUseCase: createSymbol('RunSavedCanonicalChartUseCase'),
  ListCanonicalChartsUseCase: createSymbol('ListCanonicalChartsUseCase'),
  UpdateCanonicalChartUseCase: createSymbol('UpdateCanonicalChartUseCase'),
  ListCanonicalChartRevisionsUseCase: createSymbol('ListCanonicalChartRevisionsUseCase'),
  RestoreCanonicalChartRevisionUseCase: createSymbol('RestoreCanonicalChartRevisionUseCase'),
  CancelCanonicalChartRunUseCase: createSymbol('CancelCanonicalChartRunUseCase'),
  SaveAsNewCanonicalChartUseCase: createSymbol('SaveAsNewCanonicalChartUseCase'),
  SaveChatChartPreviewUseCase: createSymbol('SaveChatChartPreviewUseCase'),
  ListChartCollectionsUseCase: createSymbol('ListChartCollectionsUseCase'),
  ChartCollectionUseCases: createSymbol('ChartCollectionUseCases'),
  ListChartCollectionsController: createSymbol('ListChartCollectionsController'),
  CreateChartCollectionController: createSymbol('CreateChartCollectionController'),
  UpdateChartCollectionController: createSymbol('UpdateChartCollectionController'),
  MoveChartCollectionController: createSymbol('MoveChartCollectionController'),
  ArchiveChartCollectionController: createSymbol('ArchiveChartCollectionController'),
  DashboardRepository: createSymbol('DashboardRepository'),
  PlantModelRepository: createSymbol('PlantModelRepository'),
  PlantModelUseCases: createSymbol('PlantModelUseCases'),
  PlantModelController: createSymbol('PlantModelController'),
  PlantWalkthroughService: createSymbol('PlantWalkthroughService'),
  PlantWalkthroughUseCases: createSymbol('PlantWalkthroughUseCases'),
  PlantWalkthroughController: createSymbol('PlantWalkthroughController'),
  DashboardRuntimeService: createSymbol('DashboardRuntimeService'),
  CreateDashboardUseCase: createSymbol('CreateDashboardUseCase'),
  GetDashboardUseCase: createSymbol('GetDashboardUseCase'),
  ListDashboardsUseCase: createSymbol('ListDashboardsUseCase'),
  SaveDashboardUseCase: createSymbol('SaveDashboardUseCase'),
  CopyDashboardUseCase: createSymbol('CopyDashboardUseCase'),
  ArchiveDashboardUseCase: createSymbol('ArchiveDashboardUseCase'),
  ExecuteDashboardUseCase: createSymbol('ExecuteDashboardUseCase'),
  ListDashboardFilterTargetsUseCase: createSymbol('ListDashboardFilterTargetsUseCase'),
  CreateDashboardController: createSymbol('CreateDashboardController'),
  GetDashboardController: createSymbol('GetDashboardController'),
  ListDashboardsController: createSymbol('ListDashboardsController'),
  SaveDashboardController: createSymbol('SaveDashboardController'),
  CopyDashboardController: createSymbol('CopyDashboardController'),
  ArchiveDashboardController: createSymbol('ArchiveDashboardController'),
  ExecuteDashboardController: createSymbol('ExecuteDashboardController'),
  ListDashboardFilterTargetsController: createSymbol('ListDashboardFilterTargetsController'),
  ListChartsController: createSymbol('ListChartsController'),
  SubscribeChartsController: createSymbol('SubscribeChartsController'),
  CreateChartController: createSymbol('CreateChartController'),
  PatchChartController: createSymbol('PatchChartController'),
  DeleteChartController: createSymbol('DeleteChartController'),
  SetChartDataFromCsvController: createSymbol('SetChartDataFromCsvController'),
  SuggestChartEncodingsController: createSymbol('SuggestChartEncodingsController'),
  PreviewCanonicalChartController: createSymbol('PreviewCanonicalChartController'),
  PreviewCanonicalChartQueryController: createSymbol('PreviewCanonicalChartQueryController'),
  CompileCanonicalChartQueryController: createSymbol('CompileCanonicalChartQueryController'),
  CreateCanonicalChartController: createSymbol('CreateCanonicalChartController'),
  GetCanonicalChartController: createSymbol('GetCanonicalChartController'),
  RunSavedCanonicalChartController: createSymbol('RunSavedCanonicalChartController'),
  ListCanonicalChartsController: createSymbol('ListCanonicalChartsController'),
  UpdateCanonicalChartController: createSymbol('UpdateCanonicalChartController'),
  ListCanonicalChartRevisionsController: createSymbol('ListCanonicalChartRevisionsController'),
  RestoreCanonicalChartRevisionController: createSymbol('RestoreCanonicalChartRevisionController'),
  CancelCanonicalChartRunController: createSymbol('CancelCanonicalChartRunController'),
  SaveAsNewCanonicalChartController: createSymbol('SaveAsNewCanonicalChartController'),
  SaveChatChartPreviewController: createSymbol('SaveChatChartPreviewController'),
  PendingActionRepository: createSymbol('PendingActionRepository'),
  ListPendingActionsUseCase: createSymbol('ListPendingActionsUseCase'),
  GetPendingActionUseCase: createSymbol('GetPendingActionUseCase'),
  ApprovePendingActionUseCase: createSymbol('ApprovePendingActionUseCase'),
  RejectPendingActionUseCase: createSymbol('RejectPendingActionUseCase'),
  ListPendingActionsController: createSymbol('ListPendingActionsController'),
  GetPendingActionController: createSymbol('GetPendingActionController'),
  ApprovePendingActionController: createSymbol('ApprovePendingActionController'),
  RejectPendingActionController: createSymbol('RejectPendingActionController'),
  ActionCatalogRepository: createSymbol('ActionCatalogRepository'),
  ListActionCatalogUseCase: createSymbol('ListActionCatalogUseCase'),
  ListActionCatalogController: createSymbol('ListActionCatalogController'),
  AgentManifestRepository: createSymbol('AgentManifestRepository'),
  ListAgentManifestsUseCase: createSymbol('ListAgentManifestsUseCase'),
  GetAgentManifestUseCase: createSymbol('GetAgentManifestUseCase'),
  SaveAgentManifestUseCase: createSymbol('SaveAgentManifestUseCase'),
  ValidateAgentManifestUseCase: createSymbol('ValidateAgentManifestUseCase'),
  DeleteAgentManifestUseCase: createSymbol('DeleteAgentManifestUseCase'),
  ListAgentManifestsController: createSymbol('ListAgentManifestsController'),
  GetAgentManifestController: createSymbol('GetAgentManifestController'),
  SaveAgentManifestController: createSymbol('SaveAgentManifestController'),
  ValidateAgentManifestController: createSymbol('ValidateAgentManifestController'),
  DeleteAgentManifestController: createSymbol('DeleteAgentManifestController'),
  SkillRepository: createSymbol('SkillRepository'),
  ListSkillsUseCase: createSymbol('ListSkillsUseCase'),
  GetSkillUseCase: createSymbol('GetSkillUseCase'),
  CreateSkillUseCase: createSymbol('CreateSkillUseCase'),
  UpdateSkillUseCase: createSymbol('UpdateSkillUseCase'),
  DeleteSkillUseCase: createSymbol('DeleteSkillUseCase'),
  ListSkillsController: createSymbol('ListSkillsController'),
  GetSkillController: createSymbol('GetSkillController'),
  CreateSkillController: createSymbol('CreateSkillController'),
  UpdateSkillController: createSymbol('UpdateSkillController'),
  DeleteSkillController: createSymbol('DeleteSkillController'),
  CitationRepository: createSymbol('CitationRepository'),
  ResolveCitationsUseCase: createSymbol('ResolveCitationsUseCase'),
  ResolveCitationsController: createSymbol('ResolveCitationsController'),
  DocumentRepository: createSymbol('DocumentRepository'),
  ListDocumentsUseCase: createSymbol('ListDocumentsUseCase'),
  UploadDocumentUseCase: createSymbol('UploadDocumentUseCase'),
  GetDocumentContentUseCase: createSymbol('GetDocumentContentUseCase'),
  ListDocumentsController: createSymbol('ListDocumentsController'),
  UploadDocumentController: createSymbol('UploadDocumentController'),
  GetDocumentContentController: createSymbol('GetDocumentContentController'),
  TutorialRepository: createSymbol('TutorialRepository'),
  TutorialProgressRepository: createSymbol('TutorialProgressRepository'),
  TutorialFeatureAccessService: createSymbol('TutorialFeatureAccessService'),
  WorkspaceContextService: createSymbol('WorkspaceContextService'),
  ListTutorialCatalogUseCase: createSymbol('ListTutorialCatalogUseCase'),
  OpenTutorialDetailUseCase: createSymbol('OpenTutorialDetailUseCase'),
  OpenTutorialWalkthroughUseCase: createSymbol('OpenTutorialWalkthroughUseCase'),
  StartTutorialRunUseCase: createSymbol('StartTutorialRunUseCase'),
  AdvanceTutorialStepUseCase: createSymbol('AdvanceTutorialStepUseCase'),
  PauseTutorialRunUseCase: createSymbol('PauseTutorialRunUseCase'),
  ResumeTutorialRunUseCase: createSymbol('ResumeTutorialRunUseCase'),
  CompleteTutorialRunUseCase: createSymbol('CompleteTutorialRunUseCase'),
  RepeatTutorialUseCase: createSymbol('RepeatTutorialUseCase'),
  ResolveOnboardingUseCase: createSymbol('ResolveOnboardingUseCase'),
  RecordOnboardingDecisionUseCase: createSymbol('RecordOnboardingDecisionUseCase'),
  ListTutorialCatalogController: createSymbol('ListTutorialCatalogController'),
  OpenTutorialDetailController: createSymbol('OpenTutorialDetailController'),
  OpenTutorialWalkthroughController: createSymbol('OpenTutorialWalkthroughController'),
  StartTutorialRunController: createSymbol('StartTutorialRunController'),
  AdvanceTutorialStepController: createSymbol('AdvanceTutorialStepController'),
  PauseTutorialRunController: createSymbol('PauseTutorialRunController'),
  ResumeTutorialRunController: createSymbol('ResumeTutorialRunController'),
  CompleteTutorialRunController: createSymbol('CompleteTutorialRunController'),
  RepeatTutorialController: createSymbol('RepeatTutorialController'),
  ResolveOnboardingController: createSymbol('ResolveOnboardingController'),
  RecordOnboardingDecisionController: createSymbol('RecordOnboardingDecisionController'),
} as const satisfies {
  readonly [TKey in keyof DI_RETURN_TYPES]: InjectionToken<TKey>;
};
