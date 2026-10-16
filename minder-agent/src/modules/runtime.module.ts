import { Module } from "@nestjs/common";
import {
  createApprovalService,
  createRunManager,
  createRuntimeToolRegistries,
} from "@infrastructure/composition";
import type { ApprovalStore, RuntimeStore } from "@application/runtime";
import type {
  ApprovalService,
  McpRuntimeTargetResolver,
  RuntimeOptionalToolResolver,
} from "@application/runtime";
import type { ManifestLoader } from "@application/agent";
import type { CompositionOptions } from "@infrastructure/composition";
import type { RuntimeToolRegistries } from "@infrastructure/tools/impl";
import type { ChatCompletionGateway } from "@infrastructure/ai";
import type {
  FileAccessPort,
  RunEvidencePort,
  TelemetryPort,
  WorkspaceProvider,
} from "@application/shared/ports/index.js";
import type { McpServerManager } from "@infrastructure/mcp";
import type { LlmConfig } from "@infrastructure/configuration";
import {
  APPROVAL_SERVICE,
  APPROVAL_STORE,
  COMPOSITION_OPTIONS,
  CONFIG,
  EVIDENCE,
  FILE_ACCESS,
  MANIFEST_LOADER,
  MCP_MANAGER,
  MCP_RUN_TARGET_RESOLVER,
  MODEL_GATEWAY,
  OPTIONAL_TOOL_RESOLVER,
  RUN_MANAGER,
  RUNTIME_STORE,
  TELEMETRY,
  TOOL_REGISTRIES,
  WORKSPACE_PROVIDER,
} from "./tokens.js";
import { AgentModule } from "./agent.module.js";
import { DatabaseModule } from "./database.module.js";
import { WorkspaceModule } from "./workspace.module.js";
import { SkillModule } from "./skill.module.js";
import { McpModule } from "./mcp.module.js";
import { ObservabilityModule } from "./observability.module.js";
import { CompositionOptionsModule } from "./composition-options.module.js";

@Module({
  imports: [
    AgentModule,
    DatabaseModule,
    WorkspaceModule,
    SkillModule,
    McpModule,
    ObservabilityModule,
    CompositionOptionsModule,
  ],
  providers: [
    {
      provide: TOOL_REGISTRIES,
      inject: [{ token: COMPOSITION_OPTIONS, optional: true }],
      useFactory: createRuntimeToolRegistries,
    },
    {
      provide: APPROVAL_SERVICE,
      inject: [APPROVAL_STORE],
      useFactory: (store: ApprovalStore | undefined) =>
        store === undefined ? undefined : createApprovalService({ store }),
    },
    {
      provide: RUN_MANAGER,
      inject: [
        { token: COMPOSITION_OPTIONS, optional: true },
        CONFIG,
        MODEL_GATEWAY,
        RUNTIME_STORE,
        TOOL_REGISTRIES,
        WORKSPACE_PROVIDER,
        EVIDENCE,
        FILE_ACCESS,
        APPROVAL_SERVICE,
        MCP_MANAGER,
        MCP_RUN_TARGET_RESOLVER,
        MANIFEST_LOADER,
        OPTIONAL_TOOL_RESOLVER,
        TELEMETRY,
      ],
      useFactory: (
        options: CompositionOptions | undefined,
        config: LlmConfig | undefined,
        gateway: ChatCompletionGateway | undefined,
        store: RuntimeStore | undefined,
        registries: RuntimeToolRegistries,
        workspaceProvider: WorkspaceProvider | undefined,
        evidence: RunEvidencePort | undefined,
        fileAccess: FileAccessPort | undefined,
        approvalService: ApprovalService | undefined,
        mcpManager: McpServerManager,
        mcpTargetResolver: McpRuntimeTargetResolver | undefined,
        manifestLoader: ManifestLoader | undefined,
        optionalToolResolver: RuntimeOptionalToolResolver | undefined,
        telemetry: TelemetryPort,
      ) =>
        createRunManager({
          options,
          config,
          gateway,
          store,
          registries,
          workspaceProvider,
          evidence,
          fileAccess,
          approvalService,
          mcpManager,
          mcpTargetResolver,
          manifestLoader,
          optionalToolResolver,
          telemetry,
        }),
    },
  ],
  exports: [TOOL_REGISTRIES, APPROVAL_SERVICE, RUN_MANAGER],
})
export class RuntimeModule {}
