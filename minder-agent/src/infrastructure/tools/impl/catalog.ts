import type { FeatureState } from "@domain/index.js";
import type {
  ToolCatalogPort,
  ToolPort,
} from "@application/shared/ports/index.js";
export interface ToolAvailabilityDescriptor {
  readonly name: string;
  readonly kind: "local" | "prompt_only" | "mcp";
  readonly state: FeatureState;
  readonly aliases: readonly string[];
}
const local = (
  name: string,
  aliases: readonly string[] = [],
): ToolAvailabilityDescriptor => ({
  name,
  kind: "local",
  state: "contract_only",
  aliases,
});
const promptOnly = (
  name: string,
  aliases: readonly string[] = [],
): ToolAvailabilityDescriptor => ({
  name,
  kind: "prompt_only",
  state: "prompt_only",
  aliases,
});
export const TOOL_CATALOG: readonly ToolAvailabilityDescriptor[] = [
  local("Read", ["read_file"]),
  local("Write", ["write_file"]),
  local("Edit", ["edit_file"]),
  local("MultiEdit"),
  local("Glob", ["list_files"]),
  local("Grep", ["grep"]),
  local("AstGrep"),
  local("Bash", ["run_command"]),
  local("HttpRequest"),
  local("AskUser"),
  local("ProposePlan"),
  local("SpawnAgent"),
  local("ManageCapabilities"),
  local("publish_message_block"),
  local("SetApplicationState"),
  local("WriteReport"),
  local("InvokeSkill", ["invoke_skill"]),
  local("ProposeSkill"),
  ...[
    "NotebookEdit",
    "WebFetch",
    "WebSearch",
    "Agent",
    "TeamCreate",
    "TeamDelete",
    "SendMessage",
    "TaskCreate",
    "TaskGet",
    "TaskList",
    "TaskUpdate",
    "TaskOutput",
    "TaskStop",
    "TodoWrite",
    "EnterPlanMode",
    "ExitPlanMode",
    "EnterWorktree",
    "ExitWorktree",
    "CronCreate",
    "CronDelete",
    "CronList",
    "Skill",
    "ToolSearch",
    "AskUserQuestion",
    "LSP",
    "memory",
    "AnalyzeImage",
    "ApplyPatch",
    "Browser",
    "CaptureScreenshot",
    "CaptureWebScreenshot",
    "ClearTodos",
    "CompleteTodo",
    "FindReferencingSymbols",
    "FindSymbol",
    "GetSessionHistory",
    "GetSubagentOutput",
    "Git",
    "InsertAfterSymbol",
    "InsertBeforeSymbol",
    "ListAgents",
    "ListSessions",
    "ListSubagents",
    "ListTodos",
    "MemorySearch",
    "MemoryWrite",
    "OpenBrowser",
    "RenameSymbol",
    "ReplaceSymbolBody",
    "Schedule",
    "TaskComplete",
  ].map((name) => promptOnly(name)),
  { name: "trino", kind: "mcp", state: "contract_only", aliases: [] },
];

/**
 * Registry of executable {@link ToolPort} instances that have been composed by
 * the application composition root (`@application/agent`). A descriptor in
 * {@link TOOL_CATALOG} is only reported as `implemented` once a matching port is
 * registered here; until then it remains `contract_only`/`prompt_only`.
 *
 * The registry is intentionally mutable but only writable through
 * {@link registerToolPorts} so the composition root is the single source of
 * truth for measured availability.
 */
const CONFIGURED_TOOL_PORTS = new Map<string, ToolPort>();

/**
 * Register executable tool ports discovered during composition. Later
 * registrations for the same descriptor name replace earlier ones so a
 * composition root can rebuild its inventory idempotently.
 */
export const registerToolPorts = (ports: readonly ToolPort[]): void => {
  for (const port of ports) {
    CONFIGURED_TOOL_PORTS.set(port.descriptor.name, port);
  }
};

/** Remove all registered ports. Primarily used to reset test composition. */
export const resetConfiguredToolPorts = (): void => {
  CONFIGURED_TOOL_PORTS.clear();
};

/** The executable tool ports currently composed into the application. */
export const configuredToolPorts = (): readonly ToolPort[] =>
  [...CONFIGURED_TOOL_PORTS.values()].sort((a, b) =>
    a.descriptor.name.localeCompare(b.descriptor.name),
  );

/**
 * Sorted names of catalog entries backed by a configured, executable port.
 * This is the measured "implemented" inventory used by the feature ledger.
 */
export const implementedCatalogNames = (): readonly string[] =>
  configuredToolPorts()
    .map((tool) => tool.descriptor.name)
    .sort();

export function createToolCatalog(): ToolCatalogPort {
  return {
    descriptors: () => TOOL_CATALOG,
    implementedNames: implementedCatalogNames,
  };
}
