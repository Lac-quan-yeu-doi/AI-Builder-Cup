import { Module } from "@nestjs/common";
import {
  createApplicationLifecycle,
  createProductionDependencies,
  type AuthOptions,
  type ProductionGraphDependencies,
} from "@infrastructure/composition";
import {
  AGENT_CONFIGURATION_STORE,
  APPROVAL_SERVICE,
  APPLICATION_LIFECYCLE,
  AUTH_OPTIONS,
  DATABASE_SHUTDOWN,
  EVIDENCE,
  FILE_ACCESS,
  MANIFEST_LOADER,
  MCP_MANAGER,
  MCP_TARGET_RESOLVER,
  PRODUCTION_DEPENDENCIES,
  ROOM_JOURNAL,
  ROOM_QUEUE,
  ROOM_REGISTRY,
  ROOM_WEBHOOK_REPOSITORY,
  RUN_MANAGER,
  SKILL_SERVICE_FOR_OWNER,
  WORKSPACE_PROVIDER,
} from "./tokens.js";
import type {
  AgentConfigurationStore,
  ManifestLoader,
} from "@application/agent";
import type { ApprovalService, RunManager } from "@application/runtime";
import type {
  FileAccessPort,
  RoomJournalPort,
  RoomQueueStore,
  RoomRepository,
  RoomWebhookRepository,
  RunEvidencePort,
} from "@application/shared/ports";
import type { SkillService } from "@application/skill";
import type { McpServerManager } from "@infrastructure/mcp";
import type { S3WorkspaceProvider } from "@infrastructure/workspace";
import type { McpTargetResolver } from "@infrastructure/composition";
import { AgentModule } from "./agent.module.js";
import { AuthModule } from "./auth.module.js";
import { DatabaseModule } from "./database.module.js";
import { McpModule } from "./mcp.module.js";
import { RoomModule } from "./room.module.js";
import { RuntimeModule } from "./runtime.module.js";
import { SkillModule } from "./skill.module.js";
import { WorkspaceModule } from "./workspace.module.js";
export { CompositionOptionsModule } from "./composition-options.module.js";

export type {
  AuthOptions,
  CompositionOptions,
  ProductionCompositionFactories,
  ProductionCompositionOptions,
} from "@infrastructure/composition";

@Module({
  imports: [
    AgentModule,
    AuthModule,
    DatabaseModule,
    McpModule,
    RoomModule,
    RuntimeModule,
    SkillModule,
    WorkspaceModule,
  ],
  providers: [
    {
      provide: PRODUCTION_DEPENDENCIES,
      inject: [
        AUTH_OPTIONS,
        RUN_MANAGER,
        WORKSPACE_PROVIDER,
        MANIFEST_LOADER,
        SKILL_SERVICE_FOR_OWNER,
        APPROVAL_SERVICE,
        EVIDENCE,
        FILE_ACCESS,
        MCP_MANAGER,
        MCP_TARGET_RESOLVER,
        ROOM_REGISTRY,
        ROOM_QUEUE,
        ROOM_JOURNAL,
        ROOM_WEBHOOK_REPOSITORY,
        AGENT_CONFIGURATION_STORE,
      ],
      useFactory: (
        authOptions: AuthOptions | undefined,
        runtime: RunManager | undefined,
        workspaceProvider: S3WorkspaceProvider | undefined,
        manifestLoader: ManifestLoader | undefined,
        skillServiceForOwner: ((owner: string) => SkillService) | undefined,
        approvalService: ApprovalService | undefined,
        evidence: RunEvidencePort | undefined,
        fileAccess: FileAccessPort | undefined,
        mcpManager: McpServerManager | undefined,
        mcpTargetResolver: McpTargetResolver | undefined,
        roomRepository: RoomRepository | undefined,
        roomQueue: RoomQueueStore | undefined,
        roomJournal: RoomJournalPort | undefined,
        roomWebhookRepository: RoomWebhookRepository | undefined,
        agentStore: AgentConfigurationStore | undefined,
      ) =>
        createProductionDependencies({
          authOptions,
          runtime,
          workspaceProvider,
          manifestLoader,
          skillServiceForOwner,
          approvalService,
          evidence,
          fileAccess,
          mcpManager,
          mcpTargetResolver,
          roomRepository,
          roomQueue,
          roomJournal,
          roomWebhookRepository,
          agentStore,
        }),
    },
    {
      provide: APPLICATION_LIFECYCLE,
      inject: [RUN_MANAGER, MCP_MANAGER, AUTH_OPTIONS, DATABASE_SHUTDOWN],
      useFactory: (
        runtime: RunManager | undefined,
        mcpManager: McpServerManager | undefined,
        authOptions: AuthOptions | undefined,
        databaseShutdown: (() => Promise<void>) | undefined,
      ) =>
        createApplicationLifecycle({
          runtime,
          mcpManager,
          databaseShutdown,
          ...(authOptions?.shutdown === undefined
            ? {}
            : { authShutdown: authOptions.shutdown }),
        }),
    },
  ],
  exports: [PRODUCTION_DEPENDENCIES, APPLICATION_LIFECYCLE],
})
export class ProductionModule {}

export type { ProductionGraphDependencies };
