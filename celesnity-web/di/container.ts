import { createCatalogModule } from '@/di/modules/catalog.module';
import { createChatModule } from '@/di/modules/chat.module';
import { createConnectionsModule } from '@/di/modules/connections.module';
import { createDatabaseServicesModule } from '@/di/modules/database-services.module';
import { createExecutionsModule } from '@/di/modules/executions.module';
import { createMessageBlocksModule } from '@/di/modules/message-blocks.module';
import { createChartsModule } from '@/di/modules/charts.module';
import { createDashboardsModule } from '@/di/modules/dashboards.module';
import { createPendingActionsModule } from '@/di/modules/pending-actions.module';
import { createActionCatalogModule } from '@/di/modules/action-catalog.module';
import { createAgentManifestsModule } from '@/di/modules/agent-manifests.module';
import { createSkillsModule } from '@/di/modules/skills.module';
import { createCitationsModule } from '@/di/modules/citations.module';
import { createDocumentsModule } from '@/di/modules/documents.module';
import { createWorkspaceTreeModule } from '@/di/modules/workspace-tree.module';
import { createAutomationWorkflowModule } from '@/di/modules/automation-workflow.module';
import { createDataWorkflowModule } from '@/di/modules/data-workflow.module';
import { createPipelinesModule } from '@/di/modules/pipelines.module';
import { createPlatformModule } from '@/di/modules/platform.module';
import { createQueriesModule } from '@/di/modules/queries.module';
import { createScriptsModule } from '@/di/modules/scripts.module';
import { createTypedContainer, resolveTypedInjection } from '@/di/typed-ioctopus';
import { createStreamingModule } from '@/di/modules/streaming.module';
import { createTutorialsModule } from '@/di/modules/tutorials.module';
import { createDevicesModule } from '@/di/modules/devices.module';
import { createMetadataCrawlerModule } from '@/di/modules/metadata-crawler.module';
import { DI_SYMBOLS, type DI_RETURN_TYPES } from '@/di/types';
import { createAuthModule } from '@/di/modules/auth.module';
import { createAdministrationModule } from '@/di/modules/administration.module';
import { createPlantModelModule } from '@/di/modules/plant-model.module';

const applicationContainer = createTypedContainer();
applicationContainer.load(Symbol.for('celesnity.AuthModule'), createAuthModule());
applicationContainer.load(
  Symbol.for('celesnity.AdministrationModule'),
  createAdministrationModule(),
);

applicationContainer.load(Symbol.for('celesnity.PlatformModule'), createPlatformModule());
applicationContainer.load(
  Symbol.for('celesnity.DatabaseServicesModule'),
  createDatabaseServicesModule(),
);
// Legacy connection symbols remain available to non-migrated screens while the
// user-facing route uses DatabaseService controllers and contracts.
applicationContainer.load(
  Symbol.for('celesnity.ConnectionsCompatibilityModule'),
  createConnectionsModule(),
);
applicationContainer.load(Symbol.for('celesnity.CatalogModule'), createCatalogModule());
applicationContainer.load(Symbol.for('celesnity.ScriptsModule'), createScriptsModule());
applicationContainer.load(Symbol.for('celesnity.ExecutionsModule'), createExecutionsModule());
applicationContainer.load(Symbol.for('celesnity.QueriesModule'), createQueriesModule());
applicationContainer.load(Symbol.for('celesnity.PipelinesModule'), createPipelinesModule());
applicationContainer.load(Symbol.for('celesnity.StreamingModule'), createStreamingModule());
applicationContainer.load(Symbol.for('celesnity.DevicesModule'), createDevicesModule());
applicationContainer.load(Symbol.for('celesnity.ChatModule'), createChatModule());
applicationContainer.load(
  Symbol.for('celesnity.MetadataCrawlerModule'),
  createMetadataCrawlerModule(),
);
applicationContainer.load(Symbol.for('celesnity.MessageBlocksModule'), createMessageBlocksModule());
applicationContainer.load(Symbol.for('celesnity.ChartsModule'), createChartsModule());
applicationContainer.load(Symbol.for('celesnity.DashboardsModule'), createDashboardsModule());
applicationContainer.load(Symbol.for('celesnity.PlantModelModule'), createPlantModelModule());
applicationContainer.load(
  Symbol.for('celesnity.PendingActionsModule'),
  createPendingActionsModule(),
);
applicationContainer.load(Symbol.for('celesnity.ActionCatalogModule'), createActionCatalogModule());
applicationContainer.load(
  Symbol.for('celesnity.AgentManifestsModule'),
  createAgentManifestsModule(),
);
applicationContainer.load(Symbol.for('celesnity.SkillsModule'), createSkillsModule());
applicationContainer.load(Symbol.for('celesnity.CitationsModule'), createCitationsModule());
applicationContainer.load(Symbol.for('celesnity.DocumentsModule'), createDocumentsModule());
applicationContainer.load(Symbol.for('celesnity.TutorialsModule'), createTutorialsModule());
applicationContainer.load(Symbol.for('celesnity.WorkspaceTreeModule'), createWorkspaceTreeModule());
applicationContainer.load(
  Symbol.for('celesnity.AutomationWorkflowModule'),
  createAutomationWorkflowModule(),
);
applicationContainer.load(Symbol.for('celesnity.DataWorkflowModule'), createDataWorkflowModule());

export function getInjection<K extends keyof typeof DI_SYMBOLS>(key: K): DI_RETURN_TYPES[K] {
  return resolveTypedInjection(applicationContainer, key, DI_SYMBOLS);
}
