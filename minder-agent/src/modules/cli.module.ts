import { Module } from "@nestjs/common";
import type { ChatCompletionGateway } from "@application/shared/ports/index.js";
import { createMinderAgent } from "@infrastructure/agent";
import {
  createS3ManifestWorkspace,
  createS3WorkspaceProviderFromEnvironment,
} from "@infrastructure/workspace";
import {
  createAgentManifestMigration,
  type ManifestMigrationWorkspace,
} from "@presentation/cli/agent-manifest-migration.js";
import { main } from "@presentation/cli/main.js";
import { CLI_RUNNER, MANIFEST_WORKSPACE, MODEL_GATEWAY } from "./tokens.js";
import { AgentModule } from "./agent.module.js";
import { WorkspaceModule } from "./workspace.module.js";

export interface CliRunner {
  run(argv: string[], environment: NodeJS.ProcessEnv): Promise<number>;
}

@Module({
  imports: [AgentModule, WorkspaceModule],
  providers: [
    {
      provide: CLI_RUNNER,
      inject: [
        { token: MODEL_GATEWAY, optional: true },
        { token: MANIFEST_WORKSPACE, optional: true },
      ],
      useFactory: (
        gateway: ChatCompletionGateway | undefined,
        manifestWorkspace: ManifestMigrationWorkspace | undefined,
      ): CliRunner => ({
        async run(argv, environment) {
          const controller = new AbortController();
          const onSigint = () => controller.abort();
          process.once("SIGINT", onSigint);
          try {
            const migrationWorkspace = await cliManifestWorkspace(
              argv,
              environment,
              manifestWorkspace,
            );
            return await main(argv, environment, {
              stdin: process.stdin,
              stdout: process.stdout,
              stderr: process.stderr,
              signal: controller.signal,
              createAgent: (config) => createMinderAgent(config, gateway),
              ...(migrationWorkspace === undefined
                ? {}
                : {
                    manifestMigration: createAgentManifestMigration({
                      workspace: migrationWorkspace,
                    }),
                  }),
            });
          } finally {
            process.removeListener("SIGINT", onSigint);
          }
        },
      }),
    },
  ],
  exports: [CLI_RUNNER],
})
export class CliModule {}

async function cliManifestWorkspace(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
  configured: ManifestMigrationWorkspace | undefined,
): Promise<ManifestMigrationWorkspace | undefined> {
  if (configured !== undefined || argv[0] !== "agent-manifests")
    return configured;
  return createS3ManifestWorkspace(
    await createS3WorkspaceProviderFromEnvironment(environment),
  );
}
