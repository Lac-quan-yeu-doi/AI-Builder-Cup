import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createManifestLoader } from "@infrastructure/agent";

const writerManifest = `
name: writer
description: Writes tenant reports.
system_prompt:
  file: prompts/writer.md
tools:
  mode: allowlist
  names: [Read, Write]
working_dir: reports
execution:
  mode: interactive
  max_iterations: 12
tags: [reporting]
mcp_servers: {}
client_tools: []
action_approvals: {}
skills: [report-writing]
`;

describe("manifest loader", () => {
  it("substitutes only the injected environment and keeps profiles tenant-scoped", async () => {
    const sources = new Map<string, string>([
      [
        "alice:agents/assistant.yaml",
        writerManifest.replace("writer", "${AGENT_NAME}"),
      ],
      [
        "bob:agents/assistant.yaml",
        writerManifest.replace("writer", "${AGENT_NAME}"),
      ],
      ["alice:prompts/writer.md", "Alice prompt"],
      ["bob:prompts/writer.md", "Bob prompt"],
    ]);
    const loader = createManifestLoader({
      environment: { AGENT_NAME: "assistant" },
      workspace: {
        async list(owner: string) {
          return sources.has(`${owner}:agents/assistant.yaml`)
            ? ["agents/assistant.yaml"]
            : [];
        },
        async read(owner: string, path: string) {
          return sources.get(`${owner}:${path}`);
        },
        async write() {},
        async remove() {},
      },
    });

    await expect(
      loader.get({ owner: "alice", name: "assistant" }),
    ).resolves.toMatchObject({
      name: "assistant",
      manifest: { name: "assistant" },
    });
    await expect(
      loader.get({ owner: "bob", name: "assistant" }),
    ).resolves.toMatchObject({
      name: "assistant",
      manifest: { name: "assistant" },
    });

    const missing = createManifestLoader({
      environment: {},
      workspace: {
        async list() {
          return ["agents/assistant.yaml"];
        },
        async read() {
          return writerManifest.replace("writer", "${MISSING_NAME}");
        },
        async write() {},
        async remove() {},
      },
    });
    await expect(missing.list("alice")).rejects.toThrow(
      "manifest environment variable is not approved: MISSING_NAME",
    );
  });

  it("parses the manifest plan-review switch", async () => {
    const loader = createManifestLoader({
      workspace: {
        async list() {
          return ["agents/writer.yaml"];
        },
        async read() {
          return writerManifest.replace(
            "  max_iterations: 12",
            "  max_iterations: 12\n  plan_review: false",
          );
        },
        async write() {},
        async remove() {},
      },
    });

    await expect(
      loader.get({ owner: "alice", name: "writer" }),
    ).resolves.toMatchObject({
      manifest: { execution: { planReview: false } },
    });
  });

  it("reuses an unchanged parsed owner profile until the workspace changes", async () => {
    let reads = 0;
    const loader = createManifestLoader({
      workspace: {
        async list() {
          return ["agents/writer.yaml", "prompts/writer.md"];
        },
        async read(_owner: string, path: string) {
          reads += 1;
          return path === "agents/writer.yaml"
            ? writerManifest
            : "You write concise reports.";
        },
        async write() {},
        async remove() {},
      },
    });

    const first = await loader.get({ owner: "alice", name: "writer" });
    const second = await loader.get({ owner: "alice", name: "writer" });

    expect(second).toBe(first);
    expect(reads).toBe(4);
  });

  it("invalidates a cached profile when its prompt asset changes", async () => {
    let prompt = "You write concise reports.";
    const loader = createManifestLoader({
      workspace: {
        async list() {
          return ["agents/writer.yaml"];
        },
        async read(_owner: string, path: string) {
          return path === "agents/writer.yaml" ? writerManifest : prompt;
        },
        async write() {},
        async remove() {},
      },
    });

    const first = await loader.get({ owner: "alice", name: "writer" });
    prompt = "You write detailed reports.";
    const second = await loader.get({ owner: "alice", name: "writer" });

    expect(first?.prompt).toBe("You write concise reports.");
    expect(second?.prompt).toBe("You write detailed reports.");
    expect(second).not.toBe(first);
  });

  it("keeps the last valid profile while notifying an invalid reload", async () => {
    let source = writerManifest;
    const changes: string[] = [];
    const loader = createManifestLoader({
      workspace: {
        async list() {
          return ["agents/writer.yaml"];
        },
        async read() {
          return source;
        },
        async write() {},
        async remove() {},
      },
    });
    const initial = await loader.get({ owner: "alice", name: "writer" });
    expect(initial).toBeDefined();

    const invalidReload = new Promise<void>((resolve) => {
      const stop = loader.watch(
        "alice",
        (change) => {
          changes.push(`${change.name}:${change.status}`);
          if (change.status === "invalid") {
            stop();
            resolve();
          }
        },
        { intervalMs: 50 },
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 75));
    source = "name: writer\nnot: valid";
    await invalidReload;

    await expect(loader.get({ owner: "alice", name: "writer" })).resolves.toBe(
      initial,
    );
    expect(changes).toContain("writer:invalid");
  });

  it("keeps the repository agent examples paste-ready", async () => {
    const agentsDirectory = fileURLToPath(
      new URL("../../../../../agents/", import.meta.url),
    );
    const repositoryRoot = fileURLToPath(
      new URL("../../../../../", import.meta.url),
    );
    const files = (await readdir(agentsDirectory)).filter((file) =>
      /^template\.ya?ml$|^[^/]+\.ya?ml$/u.test(file),
    );
    expect(files).toContain("template.yaml");
    expect(files).toContain("plant-model-assistant.yaml");

    const loader = createManifestLoader({
      environment: {
        ...process.env,
        AUTOMATION_WORKFLOW_MCP_URL: "http://localhost:8000/mcp",
        SKILL_MCP_URL: "http://localhost:8001/mcp",
        TRINO_MCP_URL: "http://localhost:8002/mcp",
        CHART_MCP_URL: "http://localhost:8003/mcp",
        DOCUMENT_MCP_URL: "http://localhost:8004/mcp",
        PLANT_MODEL_MCP_URL: "http://localhost:8005/mcp",
        CLOUD_FILE_MCP_URL: "http://localhost:8006/mcp",
        MCP_SHARED_SECRET: "test-secret",
      },
      workspace: {
        async list() {
          return [];
        },
        async read(_owner: string, path: string) {
          return readFile(`${repositoryRoot}/${path}`, "utf8");
        },
        async write() {
          throw new Error("not used");
        },
        async remove() {
          throw new Error("not used");
        },
      },
    });

    for (const file of files) {
      await expect(
        loader.validate({
          owner: "repository-examples",
          yaml: await readFile(`${agentsDirectory}/${file}`, "utf8"),
        }),
      ).resolves.toMatchObject({
        sourcePath: "agents/validation.yaml",
      });
    }
  });

  it("loads only the requesting tenant's YAML manifest and confined prompt asset", async () => {
    const reads: string[] = [];
    const loader = createManifestLoader({
      workspace: {
        async list(owner: string, prefix: string) {
          expect(prefix).toBe("agents/");
          return owner === "alice"
            ? ["agents/writer.yaml", "prompts/writer.md"]
            : ["agents/intruder.yaml"];
        },
        async read(owner: string, path: string) {
          reads.push(`${owner}:${path}`);
          if (owner === "alice" && path === "agents/writer.yaml")
            return writerManifest;
          if (owner === "alice" && path === "prompts/writer.md")
            return "You write concise reports.";
          if (owner === "bob" && path === "agents/intruder.yaml")
            return writerManifest.replace("writer", "intruder");
          return undefined;
        },
        async write() {
          throw new Error("not used");
        },
        async remove() {
          throw new Error("not used");
        },
      },
    });

    const loaded = await loader.get({ owner: "alice", name: "writer" });

    expect(loaded).toMatchObject({
      contentHash: expect.any(String),
      name: "writer",
      prompt: "You write concise reports.",
      sourcePath: "agents/writer.yaml",
      manifest: {
        skills: ["report-writing"],
        workingDirectory: "reports",
      },
    });
    expect(reads).toEqual([
      "alice:agents/writer.yaml",
      "alice:prompts/writer.md",
    ]);
  });

  it("parses a complete governance policy from the manifest YAML", async () => {
    const loader = createManifestLoader({
      workspace: {
        async list() {
          return ["agents/writer.yaml"];
        },
        async read(_owner: string, path: string) {
          if (path === "agents/writer.yaml")
            return `${writerManifest}
governance:
  action_approvals:
    tool.execute: true
    shell:run: false
  autonomy: safe
  sandbox:
    enabled: true
    allowed_commands: [git, npm]
    writable_paths: [reports, scratch]
  sensitive_files: allow_templates
  budget:
    max_input_tokens: 12000
    max_output_tokens: 2000
    max_tool_calls: 30
    max_cost_usd: 4.5
`;
          if (path === "prompts/writer.md") return "You write concise reports.";
          return undefined;
        },
        async write() {
          throw new Error("not used");
        },
        async remove() {
          throw new Error("not used");
        },
      },
    });

    await expect(
      loader.get({ owner: "alice", name: "writer" }),
    ).resolves.toMatchObject({
      manifest: {
        governance: {
          actionApprovals: { "tool.execute": true, "shell:run": false },
          autonomy: "safe",
          sandbox: {
            enabled: true,
            allowedCommands: ["git", "npm"],
            writablePaths: ["reports", "scratch"],
          },
          sensitiveFiles: "allow_templates",
          budget: {
            maxInputTokens: 12000,
            maxOutputTokens: 2000,
            maxToolCalls: 30,
            maxCostUsd: 4.5,
          },
        },
      },
    });
  });

  it("rejects prompt paths that escape the manifest directory", async () => {
    const loader = createManifestLoader({
      workspace: {
        async list() {
          return ["agents/writer.yaml"];
        },
        async read() {
          return writerManifest.replace("prompts/writer.md", "../.env");
        },
        async write() {
          throw new Error("not used");
        },
        async remove() {
          throw new Error("not used");
        },
      },
    });

    await expect(
      loader.get({ owner: "alice", name: "writer" }),
    ).rejects.toThrow("manifest prompt path escapes agents directory");
  });

  it("writes and removes a manifest only in its owner's workspace", async () => {
    const files = new Map<string, string>();
    files.set("alice:prompts/writer.md", "You write concise reports.");
    const loader = createManifestLoader({
      workspace: {
        async list(owner: string, prefix: string) {
          return [...files.keys()]
            .filter((key) => key.startsWith(`${owner}:`))
            .map((key) => key.slice(owner.length + 1))
            .filter((path) => path.startsWith(prefix));
        },
        async read(owner: string, path: string) {
          return files.get(`${owner}:${path}`);
        },
        async write(owner: string, path: string, content: string) {
          files.set(`${owner}:${path}`, content);
        },
        async remove(owner: string, path: string) {
          files.delete(`${owner}:${path}`);
        },
      },
    });

    await loader.save({ owner: "alice", name: "writer", yaml: writerManifest });

    await expect(
      loader.get({ owner: "alice", name: "writer" }),
    ).resolves.toMatchObject({
      sourcePath: "agents/writer.yaml",
    });
    await expect(
      loader.get({ owner: "bob", name: "writer" }),
    ).resolves.toBeUndefined();
    await loader.remove({ owner: "alice", name: "writer" });
    await expect(
      loader.get({ owner: "alice", name: "writer" }),
    ).resolves.toBeUndefined();
  });
});
