import { Module } from "@nestjs/common";
import {
  createModelGateway,
  createManifestLoaderProvider,
  loadConfiguredLlmConfig,
  type CompositionOptions,
} from "@infrastructure/composition";
import {
  COMPOSITION_OPTIONS,
  CONFIG,
  MANIFEST_LOADER,
  MANIFEST_WORKSPACE,
  MODEL_GATEWAY,
} from "./tokens.js";
import type { ManifestWorkspace } from "@application/agent";
import { WorkspaceModule } from "./workspace.module.js";
import { CompositionOptionsModule } from "./composition-options.module.js";

@Module({
  imports: [WorkspaceModule, CompositionOptionsModule],
  providers: [
    {
      provide: CONFIG,
      inject: [{ token: COMPOSITION_OPTIONS, optional: true }],
      useFactory: loadConfiguredLlmConfig,
    },
    {
      provide: MODEL_GATEWAY,
      inject: [{ token: COMPOSITION_OPTIONS, optional: true }, CONFIG],
      useFactory: (
        options: CompositionOptions | undefined,
        config: ReturnType<typeof loadConfiguredLlmConfig>,
      ) => createModelGateway({ options, config }),
    },
    {
      provide: MANIFEST_LOADER,
      inject: [
        MANIFEST_WORKSPACE,
        { token: COMPOSITION_OPTIONS, optional: true },
      ],
      useFactory: (
        workspace: ManifestWorkspace | undefined,
        options: CompositionOptions | undefined,
      ) => createManifestLoaderProvider({ workspace, options }),
    },
  ],
  exports: [CONFIG, MODEL_GATEWAY, MANIFEST_LOADER],
})
export class AgentModule {}
