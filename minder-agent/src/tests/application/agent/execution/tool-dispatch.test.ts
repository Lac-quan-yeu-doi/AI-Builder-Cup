import type { JsonObject, WorkspacePath } from "@domain/index.js";
import type {
  ToolExecutionContext,
  ToolPort,
  ToolResult,
} from "@application/shared/ports/index.js";
import { describe, expect, it } from "vitest";
import { dispatchToolCalls } from "@application/agent/execution/tool-dispatch.js";

const ctx = (signal: AbortSignal): ToolExecutionContext => ({
  workspace: "/w" as WorkspacePath,
  signal,
  values: new Map(),
});

function tool(
  name: string,
  readOnly: boolean,
  run: (a: JsonObject) => Promise<ToolResult>,
): ToolPort {
  return {
    descriptor: {
      name,
      description: name,
      parameters: { type: "object" },
      category: "read",
      readOnly,
      destructive: false,
      aliases: [],
    },
    execute: (a) => run(a),
  };
}

describe("dispatchToolCalls", () => {
  it("returns durable error for unknown tools without throwing", async () => {
    const results = await dispatchToolCalls(
      [{ id: "1", name: "Missing", arguments: {} }],
      [],
      ctx(new AbortController().signal),
      { allowParallelReadOnly: false },
    );
    expect(results[0]).toMatchObject({
      id: "1",
      name: "Missing",
      isError: true,
    });
  });

  it("resolves configured tool aliases before dispatch", async () => {
    const read = tool("Read", true, async () => ({
      success: true,
      content: "ok",
      metadata: {},
    }));
    const aliased: ToolPort = {
      ...read,
      descriptor: { ...read.descriptor, aliases: ["read_file"] },
    };
    const results = await dispatchToolCalls(
      [{ id: "1", name: "read_file", arguments: {} }],
      [aliased],
      ctx(new AbortController().signal),
      { allowParallelReadOnly: false },
    );
    expect(results[0]).toMatchObject({
      id: "1",
      name: "read_file",
      isError: false,
      content: "ok",
    });
  });

  it("fails all calls when truncated", async () => {
    const t = tool("Read", true, async () => ({
      success: true,
      content: "ok",
      metadata: {},
    }));
    const results = await dispatchToolCalls(
      [{ id: "1", name: "Read", arguments: { path: "a" } }],
      [t],
      ctx(new AbortController().signal),
      { truncated: true, allowParallelReadOnly: false },
    );
    expect(results[0]?.isError).toBe(true);
  });

  it("preserves call order for parallel read-only execution", async () => {
    const slow = tool("Slow", true, async (a) => {
      await new Promise((r) => setTimeout(r, 10));
      return {
        success: true,
        content: typeof a.n === "number" ? a.n.toString() : "",
        metadata: {},
      };
    });
    const fast = tool("Fast", true, async (a) => ({
      success: true,
      content: typeof a.n === "number" ? a.n.toString() : "",
      metadata: {},
    }));
    const results = await dispatchToolCalls(
      [
        { id: "1", name: "Slow", arguments: { n: 1 } },
        { id: "2", name: "Fast", arguments: { n: 2 } },
      ],
      [slow, fast],
      ctx(new AbortController().signal),
      { allowParallelReadOnly: true },
    );
    expect(results.map((r) => r.id)).toEqual(["1", "2"]);
    expect(results.map((r) => r.content)).toEqual(["1", "2"]);
  });

  it("parallelizes only the contiguous read-only prefix before a write", async () => {
    let activeReads = 0;
    let maximumActiveReads = 0;
    let readsFinished = 0;
    const read = (name: string) =>
      tool(name, true, async () => {
        activeReads += 1;
        maximumActiveReads = Math.max(maximumActiveReads, activeReads);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeReads -= 1;
        readsFinished += 1;
        return { success: true, content: name, metadata: {} };
      });
    const write = tool("Write", false, async () => ({
      success: readsFinished === 2,
      content: "write",
      metadata: {},
    }));

    const results = await dispatchToolCalls(
      [
        { id: "1", name: "ReadA", arguments: {} },
        { id: "2", name: "ReadB", arguments: {} },
        { id: "3", name: "Write", arguments: {} },
      ],
      [read("ReadA"), read("ReadB"), write],
      ctx(new AbortController().signal),
      { allowParallelReadOnly: true },
    );

    expect(maximumActiveReads).toBe(2);
    expect(results.map((result) => result.id)).toEqual(["1", "2", "3"]);
    expect(results[2]?.isError).toBe(false);
  });

  it("maps a thrown tool error to a durable error result", async () => {
    const t = tool("Boom", false, async () => {
      throw new Error("kaboom");
    });
    const results = await dispatchToolCalls(
      [{ id: "1", name: "Boom", arguments: {} }],
      [t],
      ctx(new AbortController().signal),
      { allowParallelReadOnly: false },
    );
    expect(results[0]).toMatchObject({ isError: true });
    expect(results[0]?.content).toContain("kaboom");
  });

  it("attaches validated effect intents to successful dispatch results", async () => {
    const writer = tool("Write", false, async () => ({
      success: true,
      content: "written",
      metadata: {
        loop_effects: [{ kind: "artifact", metadata: { path: "report.md" } }],
      },
    }));

    const [result] = await dispatchToolCalls(
      [{ id: "1", name: "Write", arguments: {} }],
      [writer],
      ctx(new AbortController().signal),
      { allowParallelReadOnly: false },
    );

    expect(result?.effects).toEqual([
      { kind: "tool_activated", name: "Write" },
      { kind: "artifact", metadata: { path: "report.md" } },
    ]);
  });

  it("closes undispatched calls with interrupted results after cancellation", async () => {
    const controller = new AbortController();
    const first = tool("First", false, async () => {
      controller.abort();
      return { success: true, content: "first", metadata: {} };
    });
    const second = tool("Second", false, async () => ({
      success: true,
      content: "unexpected",
      metadata: {},
    }));

    const results = await dispatchToolCalls(
      [
        { id: "1", name: "First", arguments: {} },
        { id: "2", name: "Second", arguments: {} },
      ],
      [first, second],
      ctx(controller.signal),
      { allowParallelReadOnly: false },
    );

    expect(results).toEqual([
      expect.objectContaining({ id: "1", isError: false }),
      expect.objectContaining({
        id: "2",
        isError: true,
        content: expect.stringContaining("interrupted"),
      }),
    ]);
  });
});
