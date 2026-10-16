import { generateKeyPairSync, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ChatCompletionGateway } from "@infrastructure/ai";
import { createConfiguredAuthOptions } from "@infrastructure/composition";
import {
  createProductionComposition,
  type ProductionCompositionFactories,
} from "../../support/production-composition.js";

const testDatabaseUrl = process.env.MINDER_TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

const { publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey
  .export({ format: "pem", type: "spki" })
  .toString();

function validEnvironment(): Readonly<Record<string, string>> {
  return {
    LLM_BASE_URL: "https://llm.test",
    LLM_API_KEY: "test-key",
    LLM_MODEL: "test-model",
    MINIO_ENDPOINT: "http://minio.test",
    MINIO_ACCESS_KEY: "access",
    MINIO_SECRET_KEY: "secret",
    MINIO_WORKSPACE_BUCKET: "workspace",
    MINDER_AUTH_MODE: "core-assertion",
    MINDER_ASSERTION_ISSUER: "celesnity-core",
    MINDER_ASSERTION_AUDIENCE: "minder-agent",
    MINDER_ASSERTION_PUBLIC_KEYS_JSON: JSON.stringify({
      "core-test-2026": publicKeyPem,
    }),
    MINDER_ASSERTION_REPLAY_CACHE_CAPACITY: "1024",
  };
}

describe("production composition", () => {
  it("preserves the exported production factory contract", () => {
    const factories: ProductionCompositionFactories = {
      createGateway: async () => ({
        async *stream() {
          yield { type: "text", text: "factory contract" };
        },
      }),
    };

    expect(factories.createGateway).toBeTypeOf("function");
  });

  it("wires Core assertion authentication into the HTTP dependencies", async () => {
    const composition = await createProductionComposition({
      environment: validEnvironment(),
    });

    expect(composition.dependencies.authOptions?.authenticator).toBeDefined();
    await composition.shutdown();
  });

  it("configures Core assertion authentication without requiring LLM settings", () => {
    const environment = { ...validEnvironment() };
    delete environment.LLM_BASE_URL;
    delete environment.LLM_API_KEY;
    delete environment.LLM_MODEL;

    expect(
      createConfiguredAuthOptions({ environment, factories: {} })
        ?.authenticator,
    ).toBeDefined();
  });

  it("rejects a configured runtime without production assertion settings", async () => {
    const environment = { ...validEnvironment() };
    delete environment.MINDER_AUTH_MODE;

    await expect(createProductionComposition({ environment })).rejects.toThrow(
      "MINDER_AUTH_MODE",
    );
  });

  it("selects the in-memory graph without DATABASE_URL", async () => {
    const composition = await createProductionComposition({
      environment: validEnvironment(),
    });

    expect(composition.dependencies.runtime).toBeDefined();
    await composition.shutdown();
    await composition.shutdown();
  });

  describeDatabase("custom Prisma schema", () => {
    it("uses the normalized production schema for runtime and repositories", async () => {
      const gateway: ChatCompletionGateway = {
        async *stream() {
          yield { type: "text", text: "schema test" };
        },
      };
      const schema = `composition_test_${randomUUID().replaceAll("-", "")}`;
      const composition = await createProductionComposition({
        environment: {
          ...validEnvironment(),
          DATABASE_URL: testDatabaseUrl!,
          MINDER_DATABASE_SCHEMA: schema,
        },
        authOptions: {},
        factories: {
          createGateway: async () => gateway,
          createWorkspaceProvider: async () => ({
            resolve: async () => ({ root: "/tmp/workspace", prefix: "" }),
            resolvePath: async (root, requested) => `${root}/${requested}`,
            sync: async () => undefined,
            tree: async () => ({ entries: [] }),
            read: async () => undefined,
            readSession: async () => undefined,
          }),
          createMcpManager: () => ({ close: async () => undefined }) as never,
        },
      });

      try {
        const room = await composition.dependencies.roomRepository?.create({
          owner: "schema-owner",
          name: "Schema room",
          maxConcurrentRuns: 1,
          maxQueued: 1,
          members: [],
        });
        expect(room?.name).toBe("Schema room");
      } finally {
        await composition.shutdown();
      }
    });
  });
});
