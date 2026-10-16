import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdministrationModule } from '@modules/administration.module';
import { CatalogExplorationModule } from '@modules/catalog-exploration.module';
import { ChartModule } from '@modules/chart.module';
import { CitationModule } from '@modules/citation.module';
import { DatabaseServiceModule } from '@modules/database-service.module';
import { DocumentModule } from '@modules/document.module';
import { SecurityModule } from '@modules/security.module';
import { ExecutionOrchestrationModule } from '@modules/execution-orchestration.module';
import { MessageBlockModule } from '@modules/message-block.module';
import { DeviceManagementModule } from '@modules/device-management.module';
import { QueryWorkbenchModule } from '@modules/query-workbench.module';
import { RateLimitModule } from '@modules/rate-limit.module';
import { ScriptAuthoringModule } from '@modules/script-authoring.module';
import { validateEnvironment } from '@infrastructure/configuration/environment';
import { DatabaseModule } from '@modules/database.module';
import { HealthModule } from '@modules/health.module';
import { NodeCatalogModule } from '@modules/node-catalog.module';
import { PipelineAuthoringModule } from '@modules/pipeline-authoring.module';
import { StreamingModule } from '@modules/streaming.module';
import { MetadataCrawlerModule } from '@modules/metadata-crawler.module';
import { DashboardModule } from '@modules/dashboard.module';
import { ObservabilityModule } from '@modules/observability.module';
import { TrinoMcpModule } from '@modules/trino-mcp.module';
import { AutomationWorkflowModule } from '@modules/automation-workflow.module';
import { PlantModelModule } from '@modules/plant-model.module';
import { SkillModule } from '@modules/skill.module';
import { DataWorkflowModule } from '@modules/data-workflow.module';
import { TutorialModule } from '@modules/tutorial.module';
import { GoogleDriveConnectorModule } from '@modules/google-drive-connector.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    SecurityModule,
    AdministrationModule,
    RateLimitModule,
    HealthModule,
    ObservabilityModule,
    DatabaseServiceModule,
    ScriptAuthoringModule,
    ExecutionOrchestrationModule,
    CatalogExplorationModule,
    QueryWorkbenchModule,
    NodeCatalogModule,
    PipelineAuthoringModule,
    StreamingModule,
    MetadataCrawlerModule,
    MessageBlockModule,
    ChartModule,
    DashboardModule,
    DocumentModule,
    TrinoMcpModule,
    CitationModule,
    AutomationWorkflowModule,
    SkillModule,
    DeviceManagementModule,
    PlantModelModule,
    DataWorkflowModule,
    TutorialModule,
    GoogleDriveConnectorModule,
  ],
})
export class ApiAppModule {}
