import {
  roomId,
  runId,
  workspacePath,
  type JsonObject,
} from "@domain/index.js";
import type {
  ToolExecutionContext,
  ToolPort,
  ToolResult as PortToolResult,
} from "@application/shared/ports/index.js";
import {
  ToolRegistry,
  createAutonomousRegistry,
  createInteractiveRegistry,
  type MinderTool,
  type ToolContext,
} from "@infrastructure/tools/core";
import { createAgentTool, type AgentSpawner } from "./agent-tools.js";
import { registerToolPorts } from "./catalog.js";
import { createReportTool, type ReportArtifactStore } from "./report-tools.js";
import {
  createSkillCatalogTool,
  createSkillTool,
  type SkillCatalogEntry,
} from "./skill-tools.js";

export type RuntimeToolsMode = "allowlist" | "denylist" | "all";

export interface RuntimeToolRegistryOptions {
  /** Executable ports available to interactive runs. */
  readonly interactivePorts?: readonly ToolPort[];
  /** Executable ports available to autonomous runs. */
  readonly autonomousPorts?: readonly ToolPort[];
}

export interface RuntimeOptionalToolDependencies {
  readonly allowedSkills: readonly string[];
  readonly skills?: {
    list(): Promise<readonly SkillCatalogEntry[]>;
    resolve(input: {
      readonly name: string;
    }): Promise<
      { readonly body: string; readonly resourcePath?: string } | undefined
    >;
  };
  readonly reports?: ReportArtifactStore;
  readonly spawner?: AgentSpawner;
}

export interface RuntimeToolRegistries {
  readonly interactive: ToolRegistry;
  readonly autonomous: ToolRegistry;
}

/** Compose executable ports and update the measured application inventory. */
export function composeRuntimeToolPorts(input: {
  readonly interactive: readonly ToolPort[];
  readonly autonomous: readonly ToolPort[];
}): RuntimeToolRegistries {
  const unique = new Map<string, ToolPort>();
  for (const port of [...input.interactive, ...input.autonomous])
    unique.set(port.descriptor.name, port);
  registerToolPorts([...unique.values()]);
  return createRuntimeToolRegistries({
    interactivePorts: input.interactive,
    autonomousPorts: input.autonomous,
  });
}

/**
 * Compose the built-in runtime tools with executable infrastructure ports.
 *
 * The two registries intentionally have separate arrays so an interactive-only
 * capability cannot leak into an autonomous run. A port with the same
 * canonical name as a built-in tool replaces that implementation, which lets
 * infrastructure provide a production-backed version without mutating the
 * shared core registry.
 */
export function createRuntimeToolRegistries(
  options: RuntimeToolRegistryOptions = {},
): RuntimeToolRegistries {
  return {
    interactive: composeRegistry(
      createInteractiveRegistry(),
      options.interactivePorts ?? [],
    ),
    autonomous: composeRegistry(
      createAutonomousRegistry(),
      options.autonomousPorts ?? [],
    ),
  };
}

/** Adapt the port-level tool contract used by infrastructure implementations. */
export function toolPortToMinderTool(port: ToolPort): MinderTool {
  return {
    name: port.descriptor.name,
    description: port.descriptor.description,
    parameters: port.descriptor.parameters,
    ...(port.outputLimit === undefined
      ? {}
      : { outputLimit: port.outputLimit }),
    category: port.descriptor.category,
    readOnly: port.descriptor.readOnly,
    destructive: port.descriptor.destructive,
    aliases: port.descriptor.aliases,
    async execute(arguments_, context) {
      const result = await port.execute(
        arguments_,
        toToolExecutionContext(context),
      );
      return toMinderToolResult(result);
    },
  };
}

/** Build optional tools for one admitted owner/run profile. */
export function createOptionalRuntimeTools(
  dependencies: RuntimeOptionalToolDependencies,
): readonly ToolPort[] {
  const tools: ToolPort[] = [];
  if (
    dependencies.skills !== undefined &&
    dependencies.allowedSkills.length > 0
  ) {
    tools.push(
      createSkillCatalogTool({
        list: () => dependencies.skills!.list(),
      }),
    );
    tools.push(
      createSkillTool({
        invoke: async ({ name }) => {
          if (
            !dependencies.allowedSkills.includes("*") &&
            !dependencies.allowedSkills.includes(name)
          )
            return undefined;
          return dependencies.skills!.resolve({ name });
        },
      }),
    );
  }
  if (dependencies.reports !== undefined)
    tools.push(createReportTool(dependencies.reports));
  if (dependencies.spawner !== undefined)
    tools.push(createAgentTool(dependencies.spawner));
  return tools;
}

/** Apply a manifest tool policy without mutating the shared base registry. */
export function filterRegistry(
  registry: ToolRegistry,
  mode: RuntimeToolsMode,
  names: readonly string[],
): ToolRegistry {
  if (mode === "all") return new ToolRegistry(registry.all());
  const selected = new Set(names);
  const matches = (tool: MinderTool): boolean =>
    selected.has(tool.name) ||
    (tool.aliases ?? []).some((alias) => selected.has(alias));
  return new ToolRegistry(
    registry
      .all()
      .filter((tool) =>
        mode === "allowlist" ? matches(tool) : !matches(tool),
      ),
  );
}

function composeRegistry(
  base: ToolRegistry,
  ports: readonly ToolPort[],
): ToolRegistry {
  const tools = new Map(base.all().map((tool) => [tool.name, tool]));
  for (const port of ports)
    tools.set(port.descriptor.name, toolPortToMinderTool(port));
  return new ToolRegistry([...tools.values()]);
}

function toToolExecutionContext(context: ToolContext): ToolExecutionContext {
  return {
    workspace: workspacePath(context.workingDirectory),
    ...(context.workspaceRoot === undefined
      ? {}
      : { workspaceRoot: workspacePath(context.workspaceRoot) }),
    ...(context.runId === undefined ? {} : { runId: runId(context.runId) }),
    ...(context.roomId === undefined ? {} : { roomId: roomId(context.roomId) }),
    signal: context.signal,
    ...(context.progress === undefined ? {} : { progress: context.progress }),
    ...(context.diagnostics === undefined
      ? {}
      : { diagnostics: context.diagnostics }),
    ...(context.fileAccess === undefined
      ? {}
      : { fileAccess: context.fileAccess }),
    values: new Map(),
  };
}

function toMinderToolResult(result: PortToolResult): {
  success: boolean;
  output: string;
  metadata: JsonObject;
} {
  return {
    success: result.success,
    output: result.content,
    metadata: result.metadata,
  };
}
