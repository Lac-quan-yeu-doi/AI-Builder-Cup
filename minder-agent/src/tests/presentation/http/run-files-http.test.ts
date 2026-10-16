import { sha256 } from "@infrastructure/crypto/sha256.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import { InMemoryRunManager } from "@application/runtime";
import {
  createMemoryS3WorkspaceStorage,
  createS3WorkspaceProvider,
} from "@infrastructure/workspace";
import type { LlmConfig } from "@infrastructure/configuration";
import { describe, expect, it } from "vitest";
import { request, startTestServer } from "./harness.js";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "test-key",
  model: "test-model",
};

function gateway(events: readonly ModelStreamEvent[]): ChatCompletionGateway {
  return {
    async *stream() {
      yield* events;
    },
  };
}

describe("run file content download", () => {
  it("serves workspace PDFs to the run owner and enforces the 10 MiB limit", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "minder-run-file-"));
    const workspaceProvider = createS3WorkspaceProvider({
      storage: createMemoryS3WorkspaceStorage(),
      cacheDirectory,
    });
    const sessionKey = "chat:pdf-download";
    const server = await startTestServer({
      runtime: new InMemoryRunManager({
        sha256,
        config,
        gateway: gateway([{ type: "text", text: "done" }]),
      }),
      workspaceProvider,
    });
    try {
      const started = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { session_key: sessionKey, input: "prepare a report" },
      });
      expect(started.status).toBe(202);
      const runId = (JSON.parse(started.body) as { run_id: string }).run_id;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const status = await request(server, `/api/v1/runs/${runId}/status`, {
          headers: { "x-caller-id": "alice" },
        });
        if (
          (JSON.parse(status.body) as { status: string }).status === "completed"
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      const workspace = await workspaceProvider.resolve("alice", sessionKey);
      await mkdir(join(workspace.root, "reports"), { recursive: true });
      await writeFile(
        join(workspace.root, "reports/summary.pdf"),
        "%PDF-1.7\nreport",
      );
      await workspaceProvider.sync(workspace);

      const downloaded = await request(
        server,
        `/api/v1/runs/${runId}/files/content?path=${encodeURIComponent("reports/summary.pdf")}`,
        { headers: { "x-caller-id": "alice" } },
      );
      expect(downloaded.status).toBe(200);
      expect(downloaded.headers["content-type"]).toContain("application/pdf");
      expect(downloaded.body).toBe("%PDF-1.7\nreport");

      const foreign = await request(
        server,
        `/api/v1/runs/${runId}/files/content?path=${encodeURIComponent("reports/summary.pdf")}`,
        { headers: { "x-caller-id": "bob" } },
      );
      expect(foreign.status).toBe(404);

      await writeFile(
        join(workspace.root, "reports/oversized.pdf"),
        Buffer.alloc(10 * 1024 * 1024 + 1),
      );
      await workspaceProvider.sync(workspace);
      const oversized = await request(
        server,
        `/api/v1/runs/${runId}/files/content?path=${encodeURIComponent("reports/oversized.pdf")}`,
        { headers: { "x-caller-id": "alice" } },
      );
      expect(oversized.status).toBe(413);
    } finally {
      await server.close();
      await rm(cacheDirectory, { recursive: true, force: true });
    }
  });
});
