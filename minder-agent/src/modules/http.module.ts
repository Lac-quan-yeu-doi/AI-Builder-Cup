import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import {
  createAgentConfigurationService,
  type AgentConfigurationStore,
} from "@application/agent";
import { createToolCatalog } from "@infrastructure/tools/impl";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import { ApiExceptionFilter } from "@presentation/http/common/errors/api-exception.filter.js";
import { RequestContextMiddleware } from "@presentation/http/common/request/request-context.middleware.js";
import {
  OperationsController,
  OperationsMetricsMiddleware,
  OperationsMetricsService,
} from "@presentation/http/operations/operations.controller.js";
import { CatalogController } from "@presentation/http/catalog/catalog.controller.js";
import { AgentsController } from "@presentation/http/agents/agents.controller.js";
import { ManifestsController } from "@presentation/http/agents/manifests.controller.js";
import { GovernanceController } from "@presentation/http/governance/governance.controller.js";
import { SkillsNestController } from "@presentation/http/skills/skills.controller.js";
import { McpNestController } from "@presentation/http/mcp/mcp.controller.js";
import { WorkspaceNestController } from "@presentation/http/workspace/workspace.controller.js";
import { ApprovalsNestController } from "@presentation/http/approvals/approvals.controller.js";
import { RunsNestController } from "@presentation/http/runs/runs.controller.js";
import { TurnsNestController } from "@presentation/http/runs/turns.controller.js";
import { RunAdmissionService } from "@presentation/http/runs/run-admission.service.js";
import { EventsNestController } from "@presentation/http/runs/events.controller.js";
import { RoomsNestController } from "@presentation/http/rooms/rooms.controller.js";
import { RoomWebhooksNestController } from "@presentation/http/rooms/room-webhooks.controller.js";
import { RunsV2Controller } from "@presentation/http/v2/runs.controller.js";
import { EventsV2Controller } from "@presentation/http/v2/events.controller.js";
import { GovernanceV2Controller } from "@presentation/http/v2/governance.controller.js";
import {
  AGENT_CONFIGURATION_SERVICE,
  AGENT_CONFIGURATION_STORE,
  DEBUG_LOG,
  ROOM_KEEPALIVE_MS,
  ROOM_WEBHOOK_SECRET_RESOLVER,
  SHA256,
  TOOL_CATALOG,
} from "./tokens.js";
import { AgentModule } from "./agent.module.js";
import { AuthModule } from "./auth.module.js";
import { DatabaseModule } from "./database.module.js";
import { McpModule } from "./mcp.module.js";
import { RoomModule } from "./room.module.js";
import { RuntimeModule } from "./runtime.module.js";
import { SkillModule } from "./skill.module.js";
import { WorkspaceModule } from "./workspace.module.js";
import { ObservabilityModule } from "./observability.module.js";

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
    ObservabilityModule,
  ],
  controllers: [
    OperationsController,
    CatalogController,
    AgentsController,
    ManifestsController,
    GovernanceController,
    SkillsNestController,
    McpNestController,
    WorkspaceNestController,
    ApprovalsNestController,
    RunsNestController,
    TurnsNestController,
    EventsNestController,
    RoomsNestController,
    RoomWebhooksNestController,
    RunsV2Controller,
    EventsV2Controller,
    GovernanceV2Controller,
  ],
  providers: [
    { provide: TOOL_CATALOG, useFactory: createToolCatalog },
    { provide: SHA256, useValue: sha256 },
    {
      provide: AGENT_CONFIGURATION_SERVICE,
      inject: [{ token: AGENT_CONFIGURATION_STORE, optional: true }],
      useFactory: (store?: AgentConfigurationStore) =>
        store === undefined
          ? undefined
          : (owner: string) =>
              createAgentConfigurationService({ owner, store, sha256 }),
    },
    { provide: DEBUG_LOG, useValue: undefined },
    { provide: ROOM_KEEPALIVE_MS, useValue: 15_000 },
    { provide: ROOM_WEBHOOK_SECRET_RESOLVER, useValue: undefined },
    OwnerAuthGuard,
    ApiExceptionFilter,
    { provide: APP_FILTER, useExisting: ApiExceptionFilter },
    OperationsMetricsService,
    OperationsMetricsMiddleware,
    RequestContextMiddleware,
    RunAdmissionService,
    TurnsNestController,
    RunsNestController,
    EventsNestController,
    GovernanceController,
  ],
  exports: [OwnerAuthGuard],
})
export class HttpModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, OperationsMetricsMiddleware)
      .forRoutes("*");
  }
}
