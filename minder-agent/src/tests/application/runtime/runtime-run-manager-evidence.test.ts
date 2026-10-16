import type { RunEvidencePort } from "@application/shared/ports/index.js";
import type { LlmConfig } from "@infrastructure/configuration";
import { describe, expect, it } from "vitest";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import { InMemoryRuntimeStore, RuntimeRunManager } from "@application/runtime";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "test",
  model: "test",
};

describe("RuntimeRunManager evidence", () => {
  it("keeps manifest snapshots best-effort and preserves JSON metadata", async () => {
    const records: unknown[] = [];
    const evidence: RunEvidencePort = {
      async saveManifest(_owner, record) {
        records.push(record);
        throw new Error("store unavailable");
      },
      async getManifest() {
        return undefined;
      },
      async listTrace() {
        return [];
      },
      async listValidations() {
        return [];
      },
      async getReport() {
        return undefined;
      },
    };
    const debugEntries: string[] = [];
    const manager = new RuntimeRunManager({
      config,
      sha256,
      store: new InMemoryRuntimeStore(),
      gateway: {
        async *stream() {
          yield { type: "text", text: "done" };
        },
      },
      evidence,
      debugLog: (entry) => debugEntries.push(entry),
      manifestLookup: {
        get: () => ({
          owner: "alice",
          systemPrompt: "prompt",
          manifestHash: "hash",
          manifestSourcePath: "agents/a.yaml",
          manifestYaml: "name: a",
        }),
      },
    });

    const admission = await manager.start({
      key: "chat:evidence",
      input: "hello",
      owner: "alice",
      mode: "interactive",
      trigger: { source: "chat" },
      manifestName: "a",
    });

    expect(admission.kind).toBe("started");
    expect(records[0]).toMatchObject({
      manifest: {
        manifestHash: "hash",
        manifestSourcePath: "agents/a.yaml",
        manifestYaml: "name: a",
      },
      contentHash: "hash",
      sourcePath: "agents/a.yaml",
      yaml: "name: a",
    });
    expect(debugEntries.map((entry) => JSON.parse(entry))).toContainEqual(
      expect.objectContaining({
        event: "agent_evidence_persistence_failed",
        level: "error",
        errorCode: "runtime_error",
      }),
    );
  });
});
