import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createAgentConfigurationService } from "@application/agent";
import type {
  ChatCompletionGateway,
  LlmConfig,
  ModelStreamEvent,
} from "@application/shared/ports";
import {
  createMemoryAgentConfigurationStore,
  createMinderAgent,
} from "@infrastructure/agent";
import { sha256 } from "@infrastructure/crypto/sha256.js";

const config: LlmConfig = {
  baseUrl: "http://example.test/v1",
  apiKey: "key",
  model: "model",
};

describe("infrastructure MinderAgent composition", () => {
  it("keeps built-in tools and default instruction resolution", async () => {
    const root = await mkdtemp(join(tmpdir(), "minder-agent-factory-"));
    const store = createMemoryAgentConfigurationStore(sha256);
    await createAgentConfigurationService({
      owner: "owner",
      store,
      sha256,
    }).create({
      executionStrategy: "react",
      id: "writer",
      name: "writer",
      skills: [],
      toolAllowlist: [],
    });
    await writeFile(join(root, "AGENTS.md"), "Use the project instructions.\n");
    await writeFile(join(root, "note.txt"), "built-in read works\n");

    const requests: string[] = [];
    const gateway: ChatCompletionGateway = {
      async *stream(request): AsyncIterable<ModelStreamEvent> {
        requests.push(JSON.stringify(request));
        if (requests.length === 1) {
          yield {
            type: "tool_call",
            call: {
              id: "read-1",
              name: "Read",
              arguments: JSON.stringify({ file_path: "note.txt" }),
            },
          };
          return;
        }
        yield { type: "text", text: "finished" };
      },
    };

    try {
      const agent = createMinderAgent(config, gateway, {
        workspaceRoot: root,
        projectRoot: root,
        agentConfigurations: store,
      });
      const run = agent.run("read the note");
      await expect(run.result).resolves.toMatchObject({
        status: "completed",
        text: "finished",
      });
      expect(requests[0]).toContain('"name":"Read"');
      expect(requests[1]).toContain("built-in read works");

      const profile = await agent.resolveProfile({
        callerId: "owner",
        agentId: "writer",
      });
      expect(
        profile.instructions.documents.map((document) =>
          readFileName(document.path),
        ),
      ).toContain("AGENTS.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function readFileName(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path;
}
