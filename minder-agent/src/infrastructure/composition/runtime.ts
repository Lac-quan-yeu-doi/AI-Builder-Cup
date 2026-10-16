import type { ManifestLoader } from "@application/agent";
import {
  InMemoryRunManager,
  RuntimeRunManager,
  createApprovalService,
  createHttpMessageBlockPublisher,
  type ApprovalService,
  type RunManager,
} from "@application/runtime";
import { generateSkillIndex } from "@application/skill/skill-index.js";
import { loadRepositorySkills } from "@infrastructure/skill/repository-skill-loader.js";
import { resolve } from "node:path";
import type { AgentConfigurationStore } from "@application/agent";
import type {
  FileAccessPort,
  RoomJournalPort,
  RoomQueueStore,
  RoomRepository,
  RoomWebhookRepository,
  RunEvidencePort,
  TelemetryPort,
} from "@application/shared/ports/index.js";
import type { SkillService } from "@application/skill";
import type { McpServerManager } from "@infrastructure/mcp";
import type { S3WorkspaceProvider } from "@infrastructure/workspace";
import { createProductionTelemetry } from "@infrastructure/observability";
import type {
  CompositionOptions,
  CompositionRuntimeInput,
  McpTargetResolver,
  ProductionGraphDependencies,
  ApplicationLifecycle,
  AuthOptions,
} from "./types.js";
import { createManifestLookup } from "./manifest.js";
import { loadAgentLoopStrategy } from "./environment.js";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { createLangChainAgentLoop } from "@infrastructure/agent/langchain/loop.js";
import { sha256 } from "@infrastructure/crypto/sha256.js";

export async function createRunManager(
  input: CompositionRuntimeInput,
): Promise<RunManager | undefined> {
  if (input.config === undefined || input.gateway === undefined)
    return undefined;
  const manifestLookup = createManifestLookup(input.manifestLoader);
  const environment = input.options?.environment;
  const loopStrategy = loadAgentLoopStrategy(environment);
  const messageBlockPublisher =
    environment?.CELESNITY_CORE_URL?.trim() === undefined
      ? undefined
      : createHttpMessageBlockPublisher({
          coreUrl: environment.CELESNITY_CORE_URL,
          ...(environment.MCP_SHARED_SECRET === undefined
            ? {}
            : { sharedSecret: environment.MCP_SHARED_SECRET }),
          ...(environment.CELESNITY_CORE_AUDIENCE === undefined
            ? {}
            : { audience: environment.CELESNITY_CORE_AUDIENCE }),
          ...(input.options?.fetch === undefined
            ? {}
            : { fetch: input.options.fetch }),
        });
  const repositorySkills = loadRepositorySkills(
    resolve(process.cwd(), ".agents/skills"),
  );
  const skillIndex = generateSkillIndex(repositorySkills);
  const common = {
    config: input.config,
    gateway: input.gateway,
    sha256,
    ...(input.workspaceProvider === undefined
      ? {}
      : { workspaceProvider: input.workspaceProvider }),
    mcpManager: input.mcpManager,
    ...(input.mcpTargetResolver === undefined
      ? {}
      : { mcpTargetResolver: input.mcpTargetResolver }),
    ...(manifestLookup === undefined ? {} : { manifestLookup }),
    ...(input.optionalToolResolver === undefined
      ? {}
      : { optionalToolResolver: input.optionalToolResolver }),
    ...(messageBlockPublisher === undefined ? {} : { messageBlockPublisher }),
    ...(skillIndex === undefined ? {} : { skillIndex }),
    telemetry: input.telemetry,
    debugLog: (entry: string) => process.stderr.write(`${entry}\n`),
  };
  if (input.store === undefined)
    return new InMemoryRunManager({
      ...common,
      defaultToolRegistries: input.registries,
    });
  const agentLoop =
    loopStrategy === "langchain"
      ? await createConfiguredLangChainLoop(input.options)
      : undefined;
  const runtime = new RuntimeRunManager({
    ...common,
    store: input.store,
    registry: input.registries.interactive,
    autonomousRegistry: input.registries.autonomous,
    ...(agentLoop === undefined ? {} : { agentLoop }),
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    ...(input.fileAccess === undefined ? {} : { fileAccess: input.fileAccess }),
    ...(input.approvalService === undefined
      ? {}
      : { approvalService: input.approvalService }),
  });
  await runtime.initialize();
  return runtime;
}

async function createConfiguredLangChainLoop(
  options: CompositionOptions | undefined,
) {
  const connectionString = options?.environment.DATABASE_URL?.trim();
  if (!connectionString)
    throw new Error(
      "DATABASE_URL is required when MINDER_AGENT_LOOP=langchain.",
    );
  const checkpointer = PostgresSaver.fromConnString(connectionString, {
    schema: "minder_langgraph",
  });
  try {
    await checkpointer.setup();
  } catch (error) {
    await checkpointer.end().catch(() => undefined);
    throw error;
  }
  options?.resourceScope?.add(() => checkpointer.end());
  return createLangChainAgentLoop({ checkpointer });
}

export function createProductionDependencies(input: {
  readonly authOptions: AuthOptions | undefined;
  readonly runtime: RunManager | undefined;
  readonly workspaceProvider: S3WorkspaceProvider | undefined;
  readonly manifestLoader: ManifestLoader | undefined;
  readonly skillServiceForOwner: ((owner: string) => SkillService) | undefined;
  readonly approvalService: ApprovalService | undefined;
  readonly evidence: RunEvidencePort | undefined;
  readonly fileAccess: FileAccessPort | undefined;
  readonly mcpManager: McpServerManager | undefined;
  readonly mcpTargetResolver: McpTargetResolver | undefined;
  readonly roomRepository: RoomRepository | undefined;
  readonly roomQueue: RoomQueueStore | undefined;
  readonly roomJournal: RoomJournalPort | undefined;
  readonly roomWebhookRepository: RoomWebhookRepository | undefined;
  readonly agentStore: AgentConfigurationStore | undefined;
}): ProductionGraphDependencies {
  return {
    debugLog: (entry) => process.stderr.write(`${entry}\n`),
    ...(input.authOptions === undefined
      ? {}
      : { authOptions: input.authOptions }),
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    ...(input.workspaceProvider === undefined
      ? {}
      : { workspaceProvider: input.workspaceProvider }),
    ...(input.manifestLoader === undefined
      ? {}
      : { manifestLoader: input.manifestLoader }),
    ...(input.skillServiceForOwner === undefined
      ? {}
      : { skillServiceForOwner: input.skillServiceForOwner }),
    ...(input.approvalService === undefined
      ? {}
      : { approvalService: input.approvalService }),
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    ...(input.fileAccess === undefined ? {} : { fileAccess: input.fileAccess }),
    ...(input.mcpManager === undefined ? {} : { mcpManager: input.mcpManager }),
    ...(input.mcpTargetResolver === undefined
      ? {}
      : { mcpTargetResolver: input.mcpTargetResolver }),
    ...(input.roomRepository === undefined
      ? {}
      : { roomRepository: input.roomRepository }),
    ...(input.roomQueue === undefined ? {} : { roomQueue: input.roomQueue }),
    ...(input.roomJournal === undefined
      ? {}
      : { roomJournal: input.roomJournal }),
    ...(input.roomWebhookRepository === undefined
      ? {}
      : { roomWebhookRepository: input.roomWebhookRepository }),
    ...(input.agentStore === undefined ? {} : { agentStore: input.agentStore }),
  };
}

export function createApplicationLifecycle(input: {
  readonly runtime: RunManager | undefined;
  readonly mcpManager: McpServerManager | undefined;
  readonly databaseShutdown: (() => Promise<void>) | undefined;
  readonly authShutdown?: () => Promise<void>;
}): ApplicationLifecycle {
  let closed = false;
  return {
    async onModuleDestroy() {
      if (closed) return;
      closed = true;
      let firstError: Error | undefined;
      for (const close of [
        () =>
          (
            input.runtime as
              (RunManager & { shutdown?: () => Promise<void> }) | undefined
          )?.shutdown?.(),
        () => input.mcpManager?.close(),
        () => input.authShutdown?.(),
        () => input.databaseShutdown?.(),
      ]) {
        try {
          await close();
        } catch (error) {
          firstError ??=
            error instanceof Error ? error : new Error(String(error));
        }
      }
      if (firstError !== undefined) throw firstError;
    },
  };
}

export function createProductionTelemetryProvider(
  options: CompositionOptions | undefined,
): TelemetryPort {
  return createProductionTelemetry(
    options?.environment ?? process.env,
    options?.fetch,
  );
}

export { createApprovalService };
