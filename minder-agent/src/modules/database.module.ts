import { Module } from "@nestjs/common";
import type { DynamicModule, Provider } from "@nestjs/common";
import { createMemoryAgentConfigurationStore } from "@infrastructure/agent";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import {
  PrismaAgentConfigurationStore,
  PrismaApprovalStore,
  PrismaFileAccessPort,
  PrismaRoomJournal,
  PrismaRoomQueueStore,
  PrismaRoomRepository,
  PrismaRoomWebhookRepository,
  PrismaRunEvidencePort,
  PrismaSkillStore,
} from "@infrastructure/prisma/repositories/index.js";
import { PrismaRuntimeStore } from "@infrastructure/prisma/prisma-runtime-store.js";
import { PrismaService } from "@infrastructure/prisma/prisma.service.js";
import {
  type CompositionOptions,
  type DatabaseState,
  normalizePostgresConnectionString,
} from "@infrastructure/composition";
import {
  AGENT_CONFIGURATION_STORE,
  APPROVAL_STORE,
  COMPOSITION_OPTIONS,
  DATABASE_SHUTDOWN,
  DATABASE_STATE,
  EVIDENCE,
  FILE_ACCESS,
  PRISMA_SERVICE,
  ROOM_JOURNAL,
  ROOM_QUEUE,
  ROOM_REPOSITORY,
  ROOM_WEBHOOK_REPOSITORY,
  RUNTIME_STORE,
  SKILL_STORE,
} from "./tokens.js";

const databaseExports = [
  DATABASE_STATE,
  RUNTIME_STORE,
  EVIDENCE,
  FILE_ACCESS,
  ROOM_REPOSITORY,
  ROOM_QUEUE,
  ROOM_JOURNAL,
  ROOM_WEBHOOK_REPOSITORY,
  APPROVAL_STORE,
  SKILL_STORE,
  AGENT_CONFIGURATION_STORE,
  PRISMA_SERVICE,
  DATABASE_SHUTDOWN,
];

function providers(): Provider[] {
  return [
    {
      provide: PrismaService,
      inject: [{ token: COMPOSITION_OPTIONS, optional: true }],
      useFactory: (options?: CompositionOptions) => {
        const environment = options?.environment ?? process.env;
        const connectionString = environment.DATABASE_URL?.trim();
        if (!connectionString) return undefined;
        return new PrismaService({
          datasourceUrl: normalizePostgresConnectionString(connectionString),
          ...(environment.MINDER_DATABASE_SCHEMA === undefined
            ? {}
            : { schema: environment.MINDER_DATABASE_SCHEMA }),
        });
      },
    },
    {
      provide: RUNTIME_STORE,
      inject: [
        { token: PrismaService, optional: true },
        { token: COMPOSITION_OPTIONS, optional: true },
      ],
      useFactory: (prisma?: PrismaService, options?: CompositionOptions) =>
        prisma === undefined
          ? undefined
          : new PrismaRuntimeStore({
              prisma,
              ...(options?.environment.MINDER_DATABASE_SCHEMA === undefined
                ? {}
                : { schema: options.environment.MINDER_DATABASE_SCHEMA }),
            }),
    },
    {
      provide: APPROVAL_STORE,
      inject: [{ token: PrismaService, optional: true }],
      useFactory: (prisma?: PrismaService) =>
        prisma === undefined ? undefined : new PrismaApprovalStore(prisma),
    },
    {
      provide: EVIDENCE,
      inject: [{ token: PrismaService, optional: true }],
      useFactory: (prisma?: PrismaService) =>
        prisma === undefined ? undefined : new PrismaRunEvidencePort(prisma),
    },
    {
      provide: FILE_ACCESS,
      inject: [{ token: PrismaService, optional: true }],
      useFactory: (prisma?: PrismaService) =>
        prisma === undefined ? undefined : new PrismaFileAccessPort(prisma),
    },
    {
      provide: SKILL_STORE,
      inject: [{ token: PrismaService, optional: true }],
      useFactory: (prisma?: PrismaService) =>
        prisma === undefined
          ? undefined
          : (owner: string) => new PrismaSkillStore(prisma, owner),
    },
    {
      provide: ROOM_REPOSITORY,
      inject: [{ token: PrismaService, optional: true }],
      useFactory: (prisma?: PrismaService) =>
        prisma === undefined ? undefined : new PrismaRoomRepository(prisma),
    },
    {
      provide: ROOM_QUEUE,
      inject: [{ token: PrismaService, optional: true }],
      useFactory: (prisma?: PrismaService) =>
        prisma === undefined ? undefined : new PrismaRoomQueueStore(prisma),
    },
    {
      provide: ROOM_JOURNAL,
      inject: [{ token: PrismaService, optional: true }],
      useFactory: (prisma?: PrismaService) =>
        prisma === undefined ? undefined : new PrismaRoomJournal(prisma),
    },
    {
      provide: ROOM_WEBHOOK_REPOSITORY,
      inject: [{ token: PrismaService, optional: true }],
      useFactory: (prisma?: PrismaService) =>
        prisma === undefined
          ? undefined
          : new PrismaRoomWebhookRepository(prisma),
    },
    {
      provide: AGENT_CONFIGURATION_STORE,
      inject: [{ token: PrismaService, optional: true }],
      useFactory: (prisma?: PrismaService) =>
        prisma === undefined
          ? createMemoryAgentConfigurationStore(sha256)
          : new PrismaAgentConfigurationStore(prisma),
    },
    {
      provide: PRISMA_SERVICE,
      inject: [{ token: PrismaService, optional: true }],
      useFactory: (prisma?: PrismaService) => prisma,
    },
    {
      provide: DATABASE_STATE,
      inject: [
        { token: PRISMA_SERVICE, optional: true },
        { token: RUNTIME_STORE, optional: true },
        { token: APPROVAL_STORE, optional: true },
        { token: EVIDENCE, optional: true },
        { token: FILE_ACCESS, optional: true },
        { token: SKILL_STORE, optional: true },
        { token: ROOM_REPOSITORY, optional: true },
        { token: ROOM_QUEUE, optional: true },
        { token: ROOM_JOURNAL, optional: true },
        { token: ROOM_WEBHOOK_REPOSITORY, optional: true },
        { token: AGENT_CONFIGURATION_STORE, optional: true },
        { token: COMPOSITION_OPTIONS, optional: true },
      ],
      useFactory: (
        prisma?: PrismaService,
        runtimeStore?: DatabaseState["runtimeStore"],
        approvalStore?: DatabaseState["approvalStore"],
        evidence?: DatabaseState["evidence"],
        fileAccess?: DatabaseState["fileAccess"],
        skillStore?: DatabaseState["skillStore"],
        roomRepository?: DatabaseState["roomRepository"],
        roomQueue?: DatabaseState["roomQueue"],
        roomJournal?: DatabaseState["roomJournal"],
        roomWebhookRepository?: DatabaseState["roomWebhookRepository"],
        agentStore?: DatabaseState["agentStore"],
        options?: CompositionOptions,
      ): DatabaseState => {
        let closed = false;
        const state: DatabaseState = {
          ...(prisma === undefined ? {} : { prisma }),
          ...(runtimeStore === undefined ? {} : { runtimeStore }),
          ...(approvalStore === undefined ? {} : { approvalStore }),
          ...(evidence === undefined ? {} : { evidence }),
          ...(fileAccess === undefined ? {} : { fileAccess }),
          ...(skillStore === undefined ? {} : { skillStore }),
          ...(roomRepository === undefined ? {} : { roomRepository }),
          ...(roomQueue === undefined ? {} : { roomQueue }),
          ...(roomJournal === undefined ? {} : { roomJournal }),
          ...(roomWebhookRepository === undefined
            ? {}
            : { roomWebhookRepository }),
          ...(agentStore === undefined ? {} : { agentStore }),
          async close() {
            if (closed) return;
            closed = true;
            await prisma?.$disconnect();
          },
        };
        options?.resourceScope?.add(() => state.close());
        return state;
      },
    },
    {
      provide: DATABASE_SHUTDOWN,
      inject: [DATABASE_STATE],
      useFactory: (state: DatabaseState) => () => state.close(),
    },
  ];
}

@Module({})
export class DatabaseModule {
  static register(): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: providers(),
      exports: databaseExports,
    };
  }
}
