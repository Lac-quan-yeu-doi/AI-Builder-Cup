import { describe, expect, it } from "vitest";
import type { ToolPort } from "@application/shared/ports/index.js";
import { ToolRegistry } from "@infrastructure/tools/core";
import {
  implementedCatalogNames,
  resetConfiguredToolPorts,
  registerToolPorts,
  composeRuntimeToolPorts,
  createRuntimeToolRegistries,
  createStateTool,
  filterRegistry,
  toolPortToMinderTool,
} from "@infrastructure/tools/impl";

const descriptor = {
  name: "Example",
  description: "Example tool",
  parameters: { type: "object", properties: {} } as const,
  category: "meta" as const,
  readOnly: true,
  destructive: false,
  aliases: ["example_tool"] as const,
};

describe("runtime registry adapters", () => {
  it("reports only composed executable tools as implemented", () => {
    resetConfiguredToolPorts();
    expect(implementedCatalogNames()).toEqual([]);
    registerToolPorts([createStateTool()]);
    expect(implementedCatalogNames()).toContain("SetApplicationState");
    expect(implementedCatalogNames()).not.toContain("publish_message_block");
  });

  it("forwards trusted execution context through a ToolPort adapter", async () => {
    let received: unknown;
    const port: ToolPort = {
      descriptor,
      async execute(_args, context) {
        received = context;
        return {
          success: true,
          content: "ok",
          metadata: { source: "test" },
        };
      },
    };

    const tool = toolPortToMinderTool(port);
    const signal = new AbortController().signal;
    const result = await tool.execute?.(
      {},
      {
        workspaceRoot: "/tmp/workspace",
        workingDirectory: "/tmp/workspace/subdir",
        signal,
        runId: "run-1",
        roomId: "room-1",
        callerSubject: "tenant-user",
      },
    );

    expect(result).toEqual({
      success: true,
      output: "ok",
      metadata: { source: "test" },
    });
    expect(received).toMatchObject({
      workspace: "/tmp/workspace/subdir",
      workspaceRoot: "/tmp/workspace",
      runId: "run-1",
      roomId: "room-1",
      values: new Map(),
    });
    expect((received as { signal: AbortSignal }).signal).toBe(signal);
  });

  it("filters a registry by canonical names and aliases without mutation", () => {
    const registry = new ToolRegistry([
      {
        name: "Read",
        description: "read",
        parameters: { type: "object", properties: {} },
        aliases: ["read_file"],
        readOnly: true,
        execute: async () => ({ success: true, output: "", metadata: {} }),
      },
      {
        name: "Write",
        description: "write",
        parameters: { type: "object", properties: {} },
        aliases: [],
        readOnly: false,
        execute: async () => ({ success: true, output: "", metadata: {} }),
      },
    ]);

    const filtered = filterRegistry(registry, "allowlist", ["read_file"]);

    expect(filtered.all().map((tool) => tool.name)).toEqual(["Read"]);
    expect(registry.all().map((tool) => tool.name)).toEqual(["Read", "Write"]);
    expect(
      filterRegistry(registry, "denylist", ["Read"])
        .all()
        .map((tool) => tool.name),
    ).toEqual(["Write"]);
  });

  it("composes executable ports into separate interactive and autonomous registries", () => {
    const interactivePort: ToolPort = {
      descriptor: {
        ...descriptor,
        name: "InteractiveOnly",
      },
      async execute() {
        return { success: true, content: "ok", metadata: {} };
      },
    };
    const autonomousPort: ToolPort = {
      descriptor: {
        ...descriptor,
        name: "AutonomousOnly",
      },
      async execute() {
        return { success: true, content: "ok", metadata: {} };
      },
    };

    const registries = createRuntimeToolRegistries({
      interactivePorts: [interactivePort],
      autonomousPorts: [autonomousPort],
    });

    expect(registries.interactive.get("InteractiveOnly")).toBeDefined();
    expect(registries.interactive.get("AskUser")).toBeDefined();
    expect(registries.autonomous.get("AutonomousOnly")).toBeDefined();
    expect(registries.autonomous.get("AskUser")).toBeUndefined();
  });

  it("registers ports while keeping the mode registries independent", () => {
    resetConfiguredToolPorts();
    const interactivePort: ToolPort = {
      descriptor: { ...descriptor, name: "InteractiveOnly" },
      async execute() {
        return { success: true, content: "ok", metadata: {} };
      },
    };
    const autonomousPort: ToolPort = {
      descriptor: { ...descriptor, name: "AutonomousOnly" },
      async execute() {
        return { success: true, content: "ok", metadata: {} };
      },
    };
    const registries = composeRuntimeToolPorts({
      interactive: [interactivePort],
      autonomous: [autonomousPort],
    });

    expect(registries.interactive.get("InteractiveOnly")).toBeDefined();
    expect(registries.interactive.get("AutonomousOnly")).toBeUndefined();
    expect(registries.autonomous.get("AutonomousOnly")).toBeDefined();
    expect(implementedCatalogNames()).toEqual([
      "AutonomousOnly",
      "InteractiveOnly",
    ]);
  });
});
