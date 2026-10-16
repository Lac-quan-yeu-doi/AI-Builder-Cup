import type { ChatCompletionGateway } from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import type { RequestAuthenticator } from "@infrastructure/auth";
import type {
  ManifestLoader,
  ManifestWorkspace,
  AgentConfigurationStore,
} from "@application/agent";
import type {
  ApprovalService,
  ApprovalStore,
  McpRuntimeTargetResolver,
  RuntimeOptionalToolResolver,
  RunManager,
  RunManagerToolRegistries,
  RuntimeStore,
} from "@application/runtime";
import type {
  FileAccessPort,
  RoomJournalPort,
  RoomQueueStore,
  RoomRepository,
  RoomWebhookRepository,
  RunEvidencePort,
  SkillPort,
  TelemetryPort,
  WorkspaceProvider,
} from "@application/shared/ports/index.js";
import type { SkillService } from "@application/skill";
import type { S3WorkspaceProvider } from "@infrastructure/workspace";
import type {
  DataScope,
  McpManagerTarget,
  McpServerManager,
} from "@infrastructure/mcp";
import type { RuntimeToolRegistries } from "@infrastructure/tools/impl";
import type { PrismaService } from "@infrastructure/prisma/prisma.service.js";

export interface AuthOptions {
  readonly authenticator?: RequestAuthenticator;
  readonly shutdown?: () => Promise<void>;
}

export interface ProductionCompositionFactories {
  readonly createGateway?: (
    environment: Readonly<Record<string, string | undefined>>,
  ) => Promise<ChatCompletionGateway>;
  readonly createWorkspaceProvider?: (
    environment: Readonly<Record<string, string | undefined>>,
  ) => Promise<S3WorkspaceProvider>;
  readonly createManifestLoader?: (input: {
    readonly workspace: ManifestWorkspace;
    readonly environment?: Readonly<Record<string, string | undefined>>;
  }) => ManifestLoader;
  readonly createMcpManager?: () => McpServerManager;
}

export interface ProductionCompositionOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly fetch?: typeof fetch;
  readonly factories?: ProductionCompositionFactories;
  readonly authOptions?: AuthOptions;
}

export interface CompositionOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly fetch?: typeof fetch;
  readonly factories: ProductionCompositionFactories;
  readonly authOptions?: AuthOptions;
  readonly resourceScope?: CompositionResourceScope;
}

export interface CompositionResourceScope {
  add(cleanup: () => Promise<void>): void;
  commit(): void;
  close(): Promise<void>;
}

export interface DatabaseState {
  readonly prisma?: PrismaService;
  readonly runtimeStore?: RuntimeStore;
  readonly approvalStore?: ApprovalStore;
  readonly evidence?: RunEvidencePort;
  readonly fileAccess?: FileAccessPort;
  readonly skillStore?: (owner: string) => SkillPort;
  readonly roomRepository?: RoomRepository;
  readonly roomQueue?: RoomQueueStore;
  readonly roomJournal?: RoomJournalPort;
  readonly roomWebhookRepository?: RoomWebhookRepository;
  readonly agentStore?: AgentConfigurationStore;
  close(): Promise<void>;
}

export interface ProductionGraphDependencies {
  readonly authOptions?: AuthOptions;
  readonly debugLog?: (entry: string) => void;
  readonly runtime?: RunManager;
  readonly workspaceProvider?: S3WorkspaceProvider;
  readonly manifestLoader?: ManifestLoader;
  readonly skillServiceForOwner?: (owner: string) => SkillService;
  readonly approvalService?: ApprovalService;
  readonly evidence?: RunEvidencePort;
  readonly fileAccess?: FileAccessPort;
  readonly mcpManager?: McpServerManager;
  readonly mcpTargetResolver?: McpTargetResolver;
  readonly roomRepository?: RoomRepository;
  readonly roomQueue?: RoomQueueStore;
  readonly roomJournal?: RoomJournalPort;
  readonly roomWebhookRepository?: RoomWebhookRepository;
  readonly agentStore?: AgentConfigurationStore;
}

export type McpTargetResolver = (input: {
  readonly owner: string;
  readonly agent: string;
  readonly server: string;
  readonly dataScope?: DataScope;
}) => Promise<McpManagerTarget | undefined>;

export interface ApplicationLifecycle {
  onModuleDestroy(): Promise<void>;
}

export type CompositionRuntimeInput = {
  readonly options: CompositionOptions | undefined;
  readonly config: LlmConfig | undefined;
  readonly gateway: ChatCompletionGateway | undefined;
  readonly store: RuntimeStore | undefined;
  readonly registries: RunManagerToolRegistries;
  readonly workspaceProvider: WorkspaceProvider | undefined;
  readonly evidence: RunEvidencePort | undefined;
  readonly fileAccess: FileAccessPort | undefined;
  readonly approvalService: ApprovalService | undefined;
  readonly mcpManager: McpServerManager;
  readonly mcpTargetResolver: McpRuntimeTargetResolver | undefined;
  readonly manifestLoader: ManifestLoader | undefined;
  readonly optionalToolResolver: RuntimeOptionalToolResolver | undefined;
  readonly telemetry: TelemetryPort;
};

export type { LlmConfig, RuntimeToolRegistries };
