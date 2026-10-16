import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { AgentModule } from "@modules/agent.module.js";
import { AuthModule } from "@modules/auth.module.js";
import { CliModule } from "@modules/cli.module.js";
import {
  CompositionOptionsModule,
  ProductionModule,
  type CompositionOptions,
} from "@modules/composition.module.js";
import { DatabaseModule } from "@modules/database.module.js";
import { McpModule } from "@modules/mcp.module.js";
import { ObservabilityModule } from "@modules/observability.module.js";
import { RoomModule } from "@modules/room.module.js";
import { RuntimeModule } from "@modules/runtime.module.js";
import { SkillModule } from "@modules/skill.module.js";
import { WorkspaceModule } from "@modules/workspace.module.js";
import { HttpModule } from "@modules/http.module.js";
export { CLI_RUNNER } from "@modules/tokens.js";
export type { CliRunner } from "@modules/cli.module.js";

@Module({
  imports: [
    CliModule,
    AgentModule,
    AuthModule,
    McpModule,
    ObservabilityModule,
    ProductionModule,
    RoomModule,
    RuntimeModule,
    SkillModule,
    WorkspaceModule,
  ],
})
export class AppModule {
  static registerCli(options: CompositionOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CompositionOptionsModule.register(options),
        DatabaseModule.register(),
      ],
    };
  }

  static register(options: CompositionOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CompositionOptionsModule.register(options),
        DatabaseModule.register(),
        HttpModule,
      ],
    };
  }
}
