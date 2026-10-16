import type { ToolExecutionContext } from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import {
  allowlistPolicy,
  createDashboardTool,
  createHttpRequestTool,
  createOptionalRuntimeTools,
  createPlanReviewTool,
  createReportTool,
  createSpawnAgentTool,
  createStateTool,
  denyAll,
} from "@infrastructure/tools/impl/index.js";

function context(signal?: AbortSignal): ToolExecutionContext {
  return {
    workspace: "/tmp" as never,
    signal: signal ?? new AbortController().signal,
    values: new Map(),
  };
}

describe("advanced tool families", () => {
  it("composes only owner-resolved skills allowed by the manifest", async () => {
    const requested: string[] = [];
    const tools = createOptionalRuntimeTools({
      allowedSkills: ["sales"],
      skills: {
        list: async () => [],
        resolve: async ({ name }) => {
          requested.push(name);
          return name === "sales"
            ? { body: "owner sales instructions" }
            : undefined;
        },
      },
    });
    expect(tools.map((tool) => tool.descriptor.name)).toEqual([
      "ListSkills",
      "InvokeSkill",
    ]);

    const result = await tools[1]!.execute({ name: "sales" }, context());
    expect(result).toMatchObject({
      success: true,
      content: "owner sales instructions",
    });
    expect(requested).toEqual(["sales"]);
  });

  it("lists owner skills when the manifest enables wildcard skill discovery", async () => {
    const tools = createOptionalRuntimeTools({
      allowedSkills: ["*"],
      skills: {
        list: async () => [
          {
            name: "sales",
            description: "Analyze sales performance",
            namespace: "",
            source: "project",
            readOnly: false,
          },
        ],
        resolve: async () => ({ body: "sales instructions" }),
      },
    });

    expect(tools.map((tool) => tool.descriptor.name)).toEqual([
      "ListSkills",
      "InvokeSkill",
    ]);
    await expect(tools[0]!.execute({}, context())).resolves.toMatchObject({
      success: true,
      content: JSON.stringify([
        {
          name: "sales",
          description: "Analyze sales performance",
          namespace: "",
          source: "project",
          readOnly: false,
        },
      ]),
    });
    await expect(
      tools[1]!.execute({ name: "sales" }, context()),
    ).resolves.toMatchObject({ success: true, content: "sales instructions" });
  });

  it("returns a checked-in skill resource path with its instructions", async () => {
    const resourcePath = "/usr/share/minder/skills/humanizer/";
    const tools = createOptionalRuntimeTools({
      allowedSkills: ["humanizer"],
      skills: {
        list: async () => [],
        resolve: async () => ({
          body: "Humanizer instructions.",
          resourcePath,
        }),
      },
    });
    const invokeSkill = tools.find(
      ({ descriptor }) => descriptor.name === "InvokeSkill",
    );

    await expect(
      invokeSkill?.execute({ name: "humanizer" }, context()),
    ).resolves.toMatchObject({
      success: true,
      content:
        "Sandbox resources: /usr/share/minder/skills/humanizer/ (read-only).\n\nHumanizer instructions.",
      metadata: { name: "humanizer", resourcePath },
    });
  });

  it("keeps full installed skill instructions beyond the default tool output limit", async () => {
    const body = "instruction ".repeat(1_000);
    const tools = createOptionalRuntimeTools({
      allowedSkills: ["humanizer"],
      skills: {
        list: async () => [],
        resolve: async () => ({ body }),
      },
    });
    const invokeSkill = tools.find(
      ({ descriptor }) => descriptor.name === "InvokeSkill",
    );

    await expect(
      invokeSkill?.execute({ name: "humanizer" }, context()),
    ).resolves.toMatchObject({ success: true, content: body });
  });

  it("does not advertise optional tools when dependencies are absent", () => {
    expect(createOptionalRuntimeTools({ allowedSkills: [] })).toEqual([]);
  });

  it("HttpRequest uses an allowlisted client and denies disallowed hosts", async () => {
    const calls: string[] = [];
    const tool = createHttpRequestTool({
      allowedHosts: ["api.example.com"],
      fetch: async (url) => {
        calls.push(url);
        return { status: 200, body: "ok" };
      },
    });
    const allowed = await tool.execute(
      { url: "https://api.example.com/data", method: "GET" },
      context(),
    );
    expect(allowed).toMatchObject({ success: true });
    expect(calls).toEqual(["https://api.example.com/data"]);

    const denied = await tool.execute(
      { url: "https://evil.example.net/x", method: "GET" },
      context(),
    );
    expect(denied).toMatchObject({
      success: false,
      metadata: { code: "tool_failed" },
    });
    expect(calls).toHaveLength(1);
  });

  it("HttpRequest honours a denied policy before contacting the network", async () => {
    let contacted = false;
    const tool = createHttpRequestTool(
      {
        allowedHosts: ["api.example.com"],
        fetch: async () => {
          contacted = true;
          return { status: 200, body: "ok" };
        },
      },
      denyAll,
    );
    const result = await tool.execute(
      { url: "https://api.example.com/data", method: "GET" },
      context(),
    );
    expect(result).toMatchObject({
      success: false,
      metadata: { code: "tool_denied" },
    });
    expect(contacted).toBe(false);
  });

  it("SetApplicationState returns a structured state acknowledgement", async () => {
    const tool = createStateTool();
    const result = await tool.execute(
      { key: "phase", value: "review" },
      context(),
    );
    expect(result).toMatchObject({ success: true });
    expect(result.metadata).toMatchObject({ key: "phase" });
  });

  it("WriteReport returns an artifact handle rather than an unbounded body", async () => {
    const saved: Array<{ id: string; body: string }> = [];
    const tool = createReportTool({
      saveArtifact: async (body) => {
        const id = `artifact-${saved.length + 1}`;
        saved.push({ id, body });
        return id;
      },
    });
    const result = await tool.execute(
      { title: "Summary", body: "a".repeat(50_000) },
      context(),
    );
    expect(result).toMatchObject({ success: true });
    expect(result.metadata).toMatchObject({ artifactId: "artifact-1" });
    expect(result.content.length).toBeLessThan(1000);
    expect(saved).toHaveLength(1);
  });

  it("respects a caller allowlist policy", async () => {
    const tool = createStateTool(allowlistPolicy([]));
    const result = await tool.execute(
      { key: "phase", value: "review" },
      context(),
    );
    expect(result).toMatchObject({
      success: false,
      metadata: { code: "tool_denied" },
    });
  });
});

describe("plan/spawn/dashboard tool families", () => {
  it("ProposePlan pauses for durable client review rather than executing", async () => {
    const tool = createPlanReviewTool();
    const result = await tool.execute(
      { summary: "Refactor auth", steps: ["read", "edit"] },
      context(),
    );
    expect(result).toMatchObject({ success: true });
    expect(result.metadata).toMatchObject({ pause: "plan_review" });
  });

  it("SpawnAgent delegates to a room-aware spawner", async () => {
    const spawned: Array<{ agent: string; input: string }> = [];
    const tool = createSpawnAgentTool({
      spawn: async (input) => {
        spawned.push(input);
        return { runId: "run-child" };
      },
    });
    const result = await tool.execute(
      { agent: "reviewer", input: "review this" },
      context(),
    );
    expect(result).toMatchObject({
      success: true,
      metadata: { runId: "run-child" },
    });
    expect(spawned).toEqual([{ agent: "reviewer", input: "review this" }]);
  });

  it("WriteDashboard returns an artifact handle, never an unbounded body", async () => {
    const saved: string[] = [];
    const tool = createDashboardTool({
      saveArtifact: async (spec) => {
        saved.push(spec);
        return "dashboard-1";
      },
    });
    const result = await tool.execute(
      { title: "Sales", spec: "x".repeat(40_000) },
      context(),
    );
    expect(result).toMatchObject({
      success: true,
      metadata: { artifactId: "dashboard-1" },
    });
    expect(result.content.length).toBeLessThan(1000);
    expect(saved).toHaveLength(1);
  });

  it("honours a denied policy across the new families", async () => {
    const tool = createSpawnAgentTool(
      { spawn: async () => ({ runId: "x" }) },
      denyAll,
    );
    await expect(
      tool.execute({ agent: "a", input: "b" }, context()),
    ).resolves.toMatchObject({
      success: false,
      metadata: { code: "tool_denied" },
    });
  });
});
