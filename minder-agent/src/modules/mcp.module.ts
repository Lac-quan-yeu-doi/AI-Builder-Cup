import { Module } from "@nestjs/common";
import {
  createMcpManager,
  createMcpRunTargetResolver,
  createMcpTargetResolver,
  type McpTargetResolver,
} from "@infrastructure/composition";
import {
  COMPOSITION_OPTIONS,
  MANIFEST_LOADER,
  MCP_MANAGER,
  MCP_RUN_TARGET_RESOLVER,
  MCP_TARGET_RESOLVER,
} from "./tokens.js";
import type { ManifestLoader } from "@application/agent";
import { AgentModule } from "./agent.module.js";
import { CompositionOptionsModule } from "./composition-options.module.js";

@Module({
  imports: [AgentModule, CompositionOptionsModule],
  providers: [
    {
      provide: MCP_MANAGER,
      inject: [{ token: COMPOSITION_OPTIONS, optional: true }],
      useFactory: createMcpManager,
    },
    {
      provide: MCP_TARGET_RESOLVER,
      inject: [MANIFEST_LOADER],
      useFactory: createMcpTargetResolver,
    },
    {
      provide: MCP_RUN_TARGET_RESOLVER,
      inject: [MANIFEST_LOADER, MCP_TARGET_RESOLVER],
      useFactory: (
        manifestLoader: ManifestLoader | undefined,
        targetResolver: McpTargetResolver | undefined,
      ) => createMcpRunTargetResolver({ manifestLoader, targetResolver }),
    },
  ],
  exports: [MCP_MANAGER, MCP_TARGET_RESOLVER, MCP_RUN_TARGET_RESOLVER],
})
export class McpModule {}
