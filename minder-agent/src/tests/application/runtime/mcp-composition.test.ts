import { sha256 } from "@infrastructure/crypto/sha256.js";
import type { ModelStreamEvent } from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import type { McpManagerTarget, McpServerManager } from "@infrastructure/mcp";
import { ToolRegistry, type MinderTool } from "@infrastructure/tools/core";
import { describe, expect, it } from "vitest";
import { InMemoryRunManager } from "@application/runtime/execution/run-manager.js";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};

function managerFor(tool: MinderTool): McpServerManager {
  return {
    async connectAll() {
      return [];
    },
    async discover() {
      return [];
    },
    async toolsForAgent() {
      return [tool];
    },
    async call() {
      return { success: true, content: "ok", metadata: {} };
    },
    async status() {
      return [];
    },
    async reconnect() {
      throw new Error("not used");
    },
    async closeOwner() {},
    async close() {},
  };
}

async function waitForTerminal(
  manager: InMemoryRunManager,
  runId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = manager.store.getRun(runId)?.status;
    if (status === "completed" || status === "failed") return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`run ${runId} did not finish`);
}

describe("runtime MCP composition", () => {
  it("mounts only the selected owner's manifest MCP tools into that run", async () => {
    let executions = 0;
    let modelCalls = 0;
    let seenTarget: McpManagerTarget | undefined;
    let seenDelegation:
      | {
          readonly roomId: string | undefined;
          readonly callerSubject: string | undefined;
        }
      | undefined;
    const tool: MinderTool = {
      name: "mcp__warehouse__query",
      description: "Query data",
      parameters: { type: "object" },
      readOnly: false,
      async execute(_arguments, context) {
        executions += 1;
        expect(context.runId).toBeDefined();
        seenDelegation = {
          roomId: context.roomId,
          callerSubject: context.callerSubject,
        };
        return { success: true, output: "mcp result", metadata: {} };
      },
    };
    const target: McpManagerTarget = {
      owner: "alice",
      agent: "analyst",
      server: {
        name: "warehouse",
        config: {
          kind: "remote",
          url: "https://mcp.example.test",
          headers: {},
          discoveryAllowlist: ["query"],
        },
      },
      scope: { allowedCatalogs: ["public"] },
    };
    const runtime = new InMemoryRunManager({
      sha256,
      config,
      registry: new ToolRegistry([]),
      autonomousRegistry: new ToolRegistry([]),
      mcpManager: managerFor(tool),
      mcpTargetResolver: async ({ owner, agent, dataScope }) => {
        if (owner !== "alice" || agent !== "analyst") return [];
        expect(dataScope).toEqual({ catalog: "iceberg", schema: "demo" });
        seenTarget = target;
        return [target];
      },
      runtimeGovernanceDefaults: { autonomy: "supervised" },
      gateway: {
        async *stream() {
          modelCalls += 1;
          if (modelCalls === 1) {
            yield {
              type: "tool_call",
              call: {
                id: "mcp-1",
                name: "mcp__warehouse__query",
                arguments: "{}",
              },
            } satisfies ModelStreamEvent;
            return;
          }
          yield { type: "text", text: "finished" } satisfies ModelStreamEvent;
        },
      },
    });

    const admission = await runtime.start({
      key: "mcp-composition",
      input: "query data",
      owner: "alice",
      manifestName: "analyst",
      dataScope: { catalog: "iceberg", schema: "demo" },
      delegation: { roomId: "room-1", callerSubject: "user-1" },
      mode: "autonomous",
      trigger: { source: "test" },
    });
    if (admission.kind !== "started") throw new Error("expected run");
    await waitForTerminal(runtime, admission.run.id);

    expect(executions).toBe(1);
    expect(seenDelegation).toEqual({
      roomId: "room-1",
      callerSubject: "user-1",
    });
    expect(seenTarget?.owner).toBe("alice");
    expect(runtime.store.getRun(admission.run.id)?.manifestName).toBe(
      "analyst",
    );
    expect(runtime.store.getRun(admission.run.id)?.dataScope).toEqual({
      catalog: "iceberg",
      schema: "demo",
    });
    expect(runtime.store.getRun(admission.run.id)?.responseText).toContain(
      "finished",
    );
  });
});
