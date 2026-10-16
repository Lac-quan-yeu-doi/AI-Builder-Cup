import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import type { AgentEvent } from "@domain/shared";
import { createAgentConfigurationService } from "@application/agent";
import { createMemoryAgentConfigurationStore } from "@infrastructure/agent";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import { createMemorySkillStore, createSkillService } from "@application/skill";
import { describe, expect, it } from "vitest";
import { MinderAgent } from "@application/agent";

const config: LlmConfig = {
  baseUrl: "http://example.test/v1",
  apiKey: "key",
  model: "m",
};

function fakeGateway(
  events: readonly ModelStreamEvent[],
): ChatCompletionGateway {
  return {
    async *stream() {
      yield* events;
    },
  };
}

describe("MinderAgent", () => {
  it("exposes a streaming run handle and completed result", async () => {
    const agent = new MinderAgent(
      config,
      fakeGateway([
        { type: "text", text: "first" },
        { type: "text", text: " second" },
      ]),
    );
    const run = agent.run("write a result");

    expect(await Array.fromAsync(run)).toEqual([
      { type: "text", data: "first" },
      { type: "text", data: " second" },
      { type: "done", data: { response_text: "first second" } },
    ] satisfies AgentEvent[]);
    await expect(run.result).resolves.toMatchObject({
      status: "completed",
      text: "first second",
      loopSnapshot: { version: 1 },
    });
  });

  it("interrupts a pending run and resolves its result", async () => {
    const agent = new MinderAgent(config, {
      async *stream(_request, signal) {
        await new Promise<void>((resolve, reject) => {
          if (signal.aborted) {
            reject(abortError());
            return;
          }
          signal.addEventListener("abort", () => reject(abortError()), {
            once: true,
          });
          void resolve;
        });
        yield { type: "finish", reason: "stop" };
      },
    });
    const run = agent.run("wait");
    const consuming = Array.fromAsync(run);
    await new Promise((resolve) => setTimeout(resolve, 10));
    run.interrupt();

    await expect(consuming).resolves.toEqual([
      { type: "done", data: { response_text: "" } },
    ]);
    await expect(run.result).resolves.toMatchObject({
      status: "interrupted",
      text: "",
      error: { code: "interrupted", message: "Run interrupted." },
      loopSnapshot: { version: 1 },
    });
  });

  it("rejects a second event consumer", async () => {
    const run = new MinderAgent(config, fakeGateway([])).run("one");
    run[Symbol.asyncIterator]();
    expect(() => run[Symbol.asyncIterator]()).toThrow(
      "AgentRun events may be consumed only once.",
    );
    run.interrupt();
    await run.result;
  });

  it("creates an interactive session and resumes turns through the same handle", async () => {
    const agent = new MinderAgent(
      config,
      fakeGateway([{ type: "text", text: "interactive answer" }]),
    );
    const session = agent.createInteractiveSession();
    const run = agent.runInSession(session.id, "hello from chat");

    await expect(Array.fromAsync(run)).resolves.toEqual([
      { type: "text", data: "interactive answer" },
      { type: "done", data: { response_text: "interactive answer" } },
    ] satisfies AgentEvent[]);
    await expect(run.result).resolves.toMatchObject({
      status: "completed",
      text: "interactive answer",
    });
    expect(agent.getInteractiveSession(session.id)?.turns).toBe(1);
  });

  it("returns a terminal failure for an unknown interactive session", async () => {
    const agent = new MinderAgent(config, fakeGateway([]));
    const run = agent.runInSession("missing", "hello");
    await expect(Array.fromAsync(run)).resolves.toEqual([
      { type: "done", data: { response_text: "" } },
    ]);
    await expect(run.result).resolves.toMatchObject({
      status: "failed",
      error: { code: "invalid_input" },
    });
  });
});

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

describe("MinderAgent.resolveProfile", () => {
  it("composes a caller-scoped profile from ordered instructions and allowed skills", async () => {
    const store = createMemoryAgentConfigurationStore(sha256);
    await createAgentConfigurationService({
      owner: "owner-a",
      store,
      sha256,
    }).create({
      executionStrategy: "react",
      id: "reviewer",
      name: "reviewer",
      skills: ["review"],
      toolAllowlist: [],
    });
    const skills = createSkillService({
      store: createMemorySkillStore(),
      sha256,
      globalSkills: [
        { name: "review", namespace: "code", body: "Review carefully." },
        { name: "unrelated", namespace: "misc", body: "Not allowed here." },
      ],
    });
    const agent = new MinderAgent(config, fakeGateway([]), {
      agentConfigurations: store,
      skills,
      projectRoot: process.cwd(),
    });

    const profile = await agent.resolveProfile({
      callerId: "owner-a",
      agentId: "reviewer",
      targetPath: "src/a.ts",
    });

    expect(profile).toMatchObject({
      agent: { id: "reviewer" },
      skills: [{ name: "review" }],
    });
    expect(profile.skills.map((skill) => skill.name)).not.toContain(
      "unrelated",
    );
    expect(Array.isArray(profile.instructions.documents)).toBe(true);
  });

  it("keeps missing and foreign agents indistinguishable", async () => {
    const store = createMemoryAgentConfigurationStore(sha256);
    await createAgentConfigurationService({
      owner: "owner-a",
      store,
      sha256,
    }).create({
      executionStrategy: "react",
      id: "reviewer",
      name: "reviewer",
      skills: [],
      toolAllowlist: [],
    });
    const agent = new MinderAgent(config, fakeGateway([]), {
      agentConfigurations: store,
      skills: createSkillService({ store: createMemorySkillStore(), sha256 }),
      projectRoot: process.cwd(),
    });

    await expect(
      agent.resolveProfile({
        callerId: "intruder",
        agentId: "reviewer",
        targetPath: "src/a.ts",
      }),
    ).rejects.toThrow("agent_not_found");
    await expect(
      agent.resolveProfile({
        callerId: "owner-a",
        agentId: "ghost",
        targetPath: "src/a.ts",
      }),
    ).rejects.toThrow("agent_not_found");
  });
});

describe("MinderAgent.resolveProfile MCP composition", () => {
  it("includes only the scoped MCP descriptors in the composed profile", async () => {
    const store = createMemoryAgentConfigurationStore(sha256);
    await createAgentConfigurationService({
      owner: "owner-a",
      store,
      sha256,
    }).create({
      executionStrategy: "react",
      id: "reviewer",
      name: "reviewer",
      skills: [],
      toolAllowlist: [],
    });
    const agent = new MinderAgent(config, fakeGateway([]), {
      agentConfigurations: store,
      projectRoot: process.cwd(),
      mcpDiscovery: async ({ callerId, agentId }) => {
        expect(callerId).toBe("owner-a");
        expect(agentId).toBe("reviewer");
        return [{ name: "warehouse:query", description: "q", inputSchema: {} }];
      },
    });

    const profile = await agent.resolveProfile({
      callerId: "owner-a",
      agentId: "reviewer",
    });
    expect(profile.mcp.map((tool) => tool.name)).toEqual(["warehouse:query"]);
  });

  it("defaults to no MCP descriptors when discovery is not configured", async () => {
    const store = createMemoryAgentConfigurationStore(sha256);
    await createAgentConfigurationService({
      owner: "owner-a",
      store,
      sha256,
    }).create({
      executionStrategy: "react",
      id: "reviewer",
      name: "reviewer",
      skills: [],
      toolAllowlist: [],
    });
    const agent = new MinderAgent(config, fakeGateway([]), {
      agentConfigurations: store,
      projectRoot: process.cwd(),
    });
    const profile = await agent.resolveProfile({
      callerId: "owner-a",
      agentId: "reviewer",
    });
    expect(profile.mcp).toEqual([]);
  });
});
