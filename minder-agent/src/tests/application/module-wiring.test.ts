import { NestFactory } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import type { ChatCompletionGateway } from "@infrastructure/ai";
import { AppModule } from "@bootstrap/app.module.js";
import { PrismaService } from "@infrastructure/prisma/prisma.service.js";
import {
  AGENT_CONFIGURATION_SERVICE,
  EVIDENCE,
  FILE_ACCESS,
  AUTH_OPTIONS,
  MCP_MANAGER,
  MODEL_GATEWAY,
  PRISMA_SERVICE,
  ROOM_REGISTRY,
  RUN_MANAGER,
  RUNTIME_STORE,
  WORKSPACE_PROVIDER,
} from "@modules/tokens.js";

const gateway: ChatCompletionGateway = {
  async *stream() {
    yield { type: "text", text: "module wiring" };
  },
};

function environment(databaseUrl?: string): Record<string, string> {
  return {
    LLM_BASE_URL: "https://llm.test",
    LLM_API_KEY: "test-key",
    LLM_MODEL: "test-model",
    MINIO_ENDPOINT: "http://minio.test",
    MINIO_ACCESS_KEY: "access",
    MINIO_SECRET_KEY: "secret",
    MINIO_WORKSPACE_BUCKET: "workspace",
    ...(databaseUrl === undefined ? {} : { DATABASE_URL: databaseUrl }),
  };
}

function workspaceProvider() {
  return {
    resolve: async () => ({ root: "/tmp/workspace", prefix: "" }),
    resolvePath: async (root: string, requested: string) =>
      `${root}/${requested}`,
    sync: async () => undefined,
    tree: async () => ({ entries: [] }),
    read: async () => undefined,
    readSession: async () => undefined,
  };
}

describe("Nest application module wiring", () => {
  it("uses one Nest-managed Prisma service for persistence adapters", async () => {
    const prisma = { $disconnect: async () => undefined } as PrismaService;
    const module = await Test.createTestingModule({
      imports: [
        AppModule.register({
          environment: { DATABASE_URL: "postgresql://test.invalid/minder" },
          authOptions: {},
          factories: {
            createGateway: async () => gateway,
            createWorkspaceProvider: async () => workspaceProvider(),
            createMcpManager: () => ({ close: async () => undefined }) as never,
          },
        }),
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    expect(module.get(PRISMA_SERVICE)).toBe(prisma);
    expect(module.get(RUNTIME_STORE).prisma).toBe(prisma);

    await module.close();
  });

  it("resolves the production graph through explicit application tokens", async () => {
    const mcpManager = { close: async () => undefined } as never;
    const app = await NestFactory.createApplicationContext(
      AppModule.register({
        environment: environment(),
        authOptions: {},
        factories: {
          createGateway: async () => gateway,
          createWorkspaceProvider: async () => workspaceProvider(),
          createMcpManager: () => mcpManager,
        },
      }),
      { logger: false },
    );

    expect(app.get(RUN_MANAGER)).toBeDefined();
    expect(app.get(AGENT_CONFIGURATION_SERVICE)).toBeDefined();
    expect(app.get(MODEL_GATEWAY)).toBe(gateway);
    expect(app.get(ROOM_REGISTRY)).toBeUndefined();
    expect(app.get(WORKSPACE_PROVIDER)).toBeDefined();
    expect(app.get(MCP_MANAGER)).toBe(mcpManager);

    await app.close();
  });

  it("leaves database-only evidence and file access undefined without a database", async () => {
    const app = await NestFactory.createApplicationContext(
      AppModule.register({
        environment: environment(),
        authOptions: {},
        factories: {
          createGateway: async () => gateway,
          createWorkspaceProvider: async () => workspaceProvider(),
          createMcpManager: () => ({ close: async () => undefined }) as never,
        },
      }),
      { logger: false },
    );

    expect(app.get(ROOM_REGISTRY)).toBeUndefined();
    expect(app.get(EVIDENCE)).toBeUndefined();
    expect(app.get(FILE_ACCESS)).toBeUndefined();

    await app.close();
  });

  it("owns runtime and MCP shutdown through app.close exactly once", async () => {
    let mcpCloseCalls = 0;
    const app = await NestFactory.createApplicationContext(
      AppModule.register({
        environment: environment(),
        authOptions: {},
        factories: {
          createGateway: async () => gateway,
          createWorkspaceProvider: async () => workspaceProvider(),
          createMcpManager: () =>
            ({
              close: async () => {
                mcpCloseCalls += 1;
              },
            }) as never,
        },
      }),
      { logger: false },
    );

    await app.close();
    await app.close();

    expect(mcpCloseCalls).toBe(1);
  });

  it("does not load auth configuration for a partial LLM graph", async () => {
    let app;
    try {
      app = await NestFactory.createApplicationContext(
        AppModule.register({
          environment: { LLM_BASE_URL: "https://llm.test" },
          factories: {
            createGateway: async () => gateway,
            createMcpManager: () => ({ close: async () => undefined }) as never,
          },
        }),
        { logger: false, abortOnError: false },
      );
    } catch (error) {
      expect(error).toBeUndefined();
      return;
    }

    expect(app.get(AUTH_OPTIONS)).toBeUndefined();
    await app.close();
  });
});
