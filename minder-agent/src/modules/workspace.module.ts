import { Module } from "@nestjs/common";
import {
  createManifestWorkspace,
  createWorkspaceProvider,
} from "@infrastructure/composition";
import {
  COMPOSITION_OPTIONS,
  MANIFEST_WORKSPACE,
  WORKSPACE_PROVIDER,
} from "./tokens.js";
import { CompositionOptionsModule } from "./composition-options.module.js";

@Module({
  imports: [CompositionOptionsModule],
  providers: [
    {
      provide: WORKSPACE_PROVIDER,
      inject: [{ token: COMPOSITION_OPTIONS, optional: true }],
      useFactory: createWorkspaceProvider,
    },
    {
      provide: MANIFEST_WORKSPACE,
      inject: [WORKSPACE_PROVIDER],
      useFactory: createManifestWorkspace,
    },
  ],
  exports: [WORKSPACE_PROVIDER, MANIFEST_WORKSPACE],
})
export class WorkspaceModule {}
