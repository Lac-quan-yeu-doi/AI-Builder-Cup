import type { ChatCompletionGateway } from "@infrastructure/ai";
import { OpenAiCompatibleGateway } from "@infrastructure/http";
import type { LlmConfig } from "@infrastructure/configuration";
import type { ManifestLoader, ManifestWorkspace } from "@application/agent";
import type { S3WorkspaceProvider } from "@infrastructure/workspace";
import { createManifestLoader } from "@infrastructure/agent";
import {
  createS3ManifestWorkspace,
  createS3WorkspaceProviderFromEnvironment,
} from "@infrastructure/workspace";
import type { CompositionOptions } from "./types.js";
import { isLlmConfigured } from "./environment.js";
import { createManifestWorkspaceMigrator } from "@application/agent/configuration/manifest-workspace-migrations.js";
import { createMigratingManifestLoader } from "@application/agent/configuration/migrating-manifest-loader.js";
import { loadManifestMigrationFiles } from "@infrastructure/agent/manifest-migration-files.js";
import { sha256 } from "@infrastructure/crypto/sha256.js";

export async function createModelGateway(input: {
  readonly options: CompositionOptions | undefined;
  readonly config: LlmConfig | undefined;
}): Promise<ChatCompletionGateway | undefined> {
  if (input.options === undefined || input.config === undefined)
    return undefined;
  return (
    (await input.options.factories.createGateway?.(
      input.options.environment,
    )) ??
    new OpenAiCompatibleGateway({
      ...input.config,
      ...(input.options.fetch === undefined
        ? {}
        : { fetch: input.options.fetch }),
    })
  );
}

export async function createWorkspaceProvider(
  options: CompositionOptions | undefined,
): Promise<S3WorkspaceProvider | undefined> {
  if (options === undefined || !isLlmConfigured(options.environment))
    return undefined;
  return (
    (await options.factories.createWorkspaceProvider?.(options.environment)) ??
    createS3WorkspaceProviderFromEnvironment(options.environment)
  );
}

export function createManifestWorkspace(
  provider: S3WorkspaceProvider | undefined,
): ManifestWorkspace | undefined {
  return provider === undefined
    ? undefined
    : createS3ManifestWorkspace(provider);
}

export function createManifestLoaderProvider(input: {
  readonly options: CompositionOptions | undefined;
  readonly workspace: ManifestWorkspace | undefined;
}): ManifestLoader | undefined {
  if (input.options === undefined || input.workspace === undefined)
    return undefined;
  const override = input.options.factories.createManifestLoader?.({
    workspace: input.workspace,
    environment: input.options.environment,
  });
  if (override !== undefined) return override;
  const loader = createManifestLoader({
    workspace: input.workspace,
    environment: input.options.environment,
  });
  if (input.options.environment.NODE_ENV !== "production") return loader;
  const migrator = createManifestWorkspaceMigrator({
    workspace: input.workspace,
    loader,
    sha256,
  });
  return createMigratingManifestLoader(loader, async (owner) => {
    await migrator.migrate(owner, await loadManifestMigrationFiles());
  });
}
