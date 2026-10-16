import { describe, expect, it } from "vitest";
import {
  createAutonomousRegistry,
  createInteractiveRegistry,
} from "@infrastructure/tools/core/index.js";

describe("tool registries by run mode", () => {
  it("exposes interactive tools including executable todo controls", () => {
    const registry = createInteractiveRegistry();
    expect(registry.definitions().map((tool) => tool.function.name)).toEqual([
      "Read",
      "Write",
      "Edit",
      "MultiEdit",
      "Glob",
      "Grep",
      "Bash",
      "TodoWrite",
      "TaskUpdate",
      "AskUser",
    ]);
    expect(registry.get("TodoWrite")?.execute).toBeDefined();
    expect(registry.get("TaskUpdate")?.execute).toBeDefined();
    expect(registry.get("AskUser")?.execute).toBeUndefined();
  });

  it("exposes confined tools but excludes AskUser from autonomous runs", () => {
    const registry = createAutonomousRegistry();
    expect(registry.definitions().map((tool) => tool.function.name)).toEqual([
      "Read",
      "Write",
      "Edit",
      "MultiEdit",
      "Glob",
      "Grep",
      "Bash",
    ]);
    expect(registry.get("AskUser")).toBeUndefined();
  });
});
