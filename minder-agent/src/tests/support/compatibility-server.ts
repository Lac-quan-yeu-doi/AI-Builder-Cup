import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import type { ApprovalService, RunManager } from "@application/runtime";
import {
  createMemoryRoomRepository,
  createMemoryRoomWebhookRepository,
} from "@application/room/memory.js";
import type {
  AgentConfigurationStore,
  ManifestLoader,
} from "@application/agent";
import type { SkillService } from "@application/skill";
import type {
  FileAccessPort,
  HttpMcpManager,
  McpManagerTarget,
  RoomJournalPort,
  RoomQueuePersistence,
  RoomRepository,
  RoomWebhookRepository,
  RunEvidencePort,
  WorkspaceProvider,
} from "@application/shared/ports/index.js";
import { AppModule } from "@bootstrap/app.module.js";
import { configureHttpApplication } from "@bootstrap/http-main.js";
import type { OwnerResolverOptions } from "@presentation/http/guards/authentication.js";
import type { WebhookSecretResolver } from "@presentation/http/rooms/rooms.controller.js";
import {
  AGENT_CONFIGURATION_STORE,
  APPROVAL_SERVICE,
  AUTH_OPTIONS,
  DEBUG_LOG,
  EVIDENCE,
  FILE_ACCESS,
  MANIFEST_LOADER,
  MCP_MANAGER,
  MCP_TARGET_RESOLVER,
  ROOM_JOURNAL,
  ROOM_KEEPALIVE_MS,
  ROOM_REPOSITORY,
  ROOM_QUEUE,
  ROOM_WEBHOOK_REPOSITORY,
  ROOM_WEBHOOK_SECRET_RESOLVER,
  RUN_MANAGER,
  SKILL_SERVICE_FOR_OWNER,
  WORKSPACE_PROVIDER,
} from "@modules/tokens.js";
import { parseListenAddress } from "@presentation/http/adapter.js";

export { parseListenAddress };

export interface CompatibilityServer {
  readonly app: INestApplication;
  readonly address: { host: string; port: number };
  close(): Promise<void>;
}

export interface StartServerOptions {
  host: string;
  port: number;
}

export interface MinderServeDependencies {
  readonly debugLog?: (entry: string) => void;
  readonly runtime?: RunManager;
  readonly agentStore?: AgentConfigurationStore;
  readonly roomRepository?: RoomRepository;
  readonly authOptions?: OwnerResolverOptions;
  readonly workspaceProvider?: WorkspaceProvider;
  readonly roomKeepaliveMs?: number;
  readonly manifestLoader?: ManifestLoader;
  readonly skillServiceForOwner?: (owner: string) => SkillService;
  readonly roomWebhookRepository?: RoomWebhookRepository;
  readonly roomQueue?: RoomQueuePersistence;
  readonly roomJournal?: RoomJournalPort;
  readonly webhookSecretResolver?: WebhookSecretResolver;
  readonly approvalService?: ApprovalService;
  readonly mcpManager?: HttpMcpManager;
  readonly mcpTargetResolver?: (input: {
    readonly owner: string;
    readonly agent: string;
    readonly server: string;
  }) => McpManagerTarget | undefined | Promise<McpManagerTarget | undefined>;
  readonly evidence?: RunEvidencePort;
  readonly fileAccess?: FileAccessPort;
}

export function startCompatibilityServer(
  options: StartServerOptions,
  dependencies: MinderServeDependencies,
): Promise<CompatibilityServer>;
export function startCompatibilityServer(
  options: StartServerOptions,
  runtime?: RunManager,
  agentStore?: AgentConfigurationStore,
  roomRepository?: RoomRepository,
  authOptions?: OwnerResolverOptions,
  workspaceProvider?: WorkspaceProvider,
): Promise<CompatibilityServer>;
export async function startCompatibilityServer(
  options: StartServerOptions,
  runtimeOrDependencies?: RunManager | MinderServeDependencies,
  agentStore?: AgentConfigurationStore,
  roomRepository?: RoomRepository,
  authOptions: OwnerResolverOptions = {},
  workspaceProvider?: WorkspaceProvider,
): Promise<CompatibilityServer> {
  const dependencies = isDependencies(runtimeOrDependencies)
    ? runtimeOrDependencies
    : {
        ...(runtimeOrDependencies === undefined
          ? {}
          : { runtime: runtimeOrDependencies }),
        ...(agentStore === undefined ? {} : { agentStore }),
        ...(roomRepository === undefined ? {} : { roomRepository }),
        authOptions,
        ...(workspaceProvider === undefined ? {} : { workspaceProvider }),
      };

  const builder = Test.createTestingModule({
    imports: [
      AppModule.register({
        environment: {},
        factories: {},
        authOptions: dependencies.authOptions ?? {},
      }),
    ],
  });
  overrideProviders(builder, dependencies);

  const moduleRef = await builder.compile();
  const app = configureHttpApplication(moduleRef.createNestApplication());
  await app.listen(options.port, options.host);
  const address = new URL(await app.getUrl());
  return {
    app,
    address: { host: options.host, port: Number(address.port) },
    close: () => app.close().then(() => undefined),
  };
}

function overrideProviders(
  builder: TestingModuleBuilder,
  dependencies: MinderServeDependencies,
): void {
  const overrides: readonly [symbol, unknown][] = [
    [RUN_MANAGER, dependencies.runtime],
    [AGENT_CONFIGURATION_STORE, dependencies.agentStore],
    [
      ROOM_REPOSITORY,
      dependencies.roomRepository ?? createMemoryRoomRepository(),
    ],
    [AUTH_OPTIONS, dependencies.authOptions],
    [WORKSPACE_PROVIDER, dependencies.workspaceProvider],
    [ROOM_KEEPALIVE_MS, dependencies.roomKeepaliveMs],
    [MANIFEST_LOADER, dependencies.manifestLoader],
    [SKILL_SERVICE_FOR_OWNER, dependencies.skillServiceForOwner],
    [
      ROOM_WEBHOOK_REPOSITORY,
      dependencies.roomWebhookRepository ?? createMemoryRoomWebhookRepository(),
    ],
    [ROOM_QUEUE, dependencies.roomQueue],
    [ROOM_JOURNAL, dependencies.roomJournal],
    [ROOM_WEBHOOK_SECRET_RESOLVER, dependencies.webhookSecretResolver],
    [APPROVAL_SERVICE, dependencies.approvalService],
    [MCP_MANAGER, dependencies.mcpManager],
    [MCP_TARGET_RESOLVER, dependencies.mcpTargetResolver],
    [EVIDENCE, dependencies.evidence],
    [FILE_ACCESS, dependencies.fileAccess],
    [DEBUG_LOG, dependencies.debugLog],
  ];
  for (const [token, value] of overrides) {
    if (value !== undefined) builder.overrideProvider(token).useValue(value);
  }
}

function isDependencies(
  value: RunManager | MinderServeDependencies | undefined,
): value is MinderServeDependencies {
  return (
    value !== undefined && typeof (value as RunManager).start !== "function"
  );
}
