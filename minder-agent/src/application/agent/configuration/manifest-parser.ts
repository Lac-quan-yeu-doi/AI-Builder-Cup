import type { JsonObject } from "@domain/index.js";
import { parseGovernancePolicy } from "../policy/governance-manifest.js";
import type {
  AgentManifest,
  ClientToolSpec,
  McpServerConfig,
  ResolvedAgentManifest,
} from "./manifests.js";

export function substituteEnvironment(
  source: string,
  environment: Readonly<Record<string, string | undefined>>,
): string {
  return source.replaceAll(
    /\$\{([A-Z_][A-Z0-9_]*)\}/gu,
    (_match, name: string) => {
      const value = environment[name];
      if (value === undefined)
        throw new Error(
          `manifest environment variable is not approved: ${name}`,
        );
      return value;
    },
  );
}

export function parseAgentManifest(
  source: string,
  sourcePath: string,
  parseYaml: (source: string) => unknown,
): ResolvedAgentManifest {
  let value: unknown;
  try {
    value = parseYaml(source);
  } catch (error) {
    throw new Error(
      `invalid YAML manifest at ${sourcePath}: ${errorMessage(error)}`,
      { cause: error },
    );
  }
  const input = record(value, `invalid manifest at ${sourcePath}`);
  const systemPrompt = parsePrompt(input.system_prompt, sourcePath);
  const tools = record(input.tools, "manifest tools is required");
  const execution = record(input.execution, "manifest execution is required");
  return {
    name: manifestName(requiredString(input.name, "manifest name is required")),
    description: requiredString(
      input.description,
      "manifest description is required",
    ),
    model: parseModel(input.model),
    systemPrompt,
    tools: {
      mode: enumValue(
        inputString(tools.mode, "manifest tools.mode is required"),
        ["allowlist", "denylist", "all"] as const,
        "manifest tools.mode is invalid",
      ),
      names: strings(tools.names, "manifest tools.names is invalid"),
    },
    workingDirectory: optionalString(input.working_dir) ?? ".",
    execution: {
      mode: enumValue(
        inputString(execution.mode, "manifest execution.mode is required"),
        ["autonomous", "interactive"] as const,
        "manifest execution.mode is invalid",
      ),
      maxIterations: positiveInteger(
        execution.max_iterations ?? 50,
        "manifest execution.max_iterations is invalid",
      ),
      ...(execution.plan_review === undefined
        ? {}
        : {
            planReview: booleanValue(
              execution.plan_review,
              "manifest execution.plan_review is invalid",
            ),
          }),
      ...(optionalNumber(execution.interrupt_on_cost) === undefined
        ? {}
        : {
            interruptOnCost: positiveNumber(
              execution.interrupt_on_cost,
              "manifest execution.interrupt_on_cost is invalid",
            ),
          }),
    },
    ...(input.handoff === undefined
      ? {}
      : { handoff: parseHandoff(input.handoff) }),
    tags: strings(input.tags ?? [], "manifest tags is invalid"),
    mcpServers: parseMcpServers(input.mcp_servers ?? {}),
    clientTools: parseClientTools(input.client_tools ?? []),
    actionApprovals: booleanRecord(
      input.action_approvals ?? {},
      "manifest action_approvals is invalid",
    ),
    governance: parseGovernancePolicy(input.governance),
    skills: strings(input.skills ?? [], "manifest skills is invalid"),
  };
}

function parsePrompt(
  value: unknown,
  sourcePath: string,
): AgentManifest["systemPrompt"] {
  if (typeof value === "string") return { kind: "inline", value };
  const input = record(
    value,
    `manifest system_prompt is required in ${sourcePath}`,
  );
  return {
    kind: "file",
    value: confinedWorkspacePath(
      requiredString(input.file, "manifest prompt file is required"),
    ),
  };
}

function parseModel(value: unknown): AgentManifest["model"] {
  if (value === undefined) return {};
  const input = record(value, "manifest model is invalid");
  const provider = optionalString(input.provider);
  const name = optionalString(input.name);
  const thinking = optionalString(input.thinking);
  const temperature = optionalNumber(input.temperature);
  const maxTokens = optionalNumber(input.max_tokens);
  return {
    ...(provider === undefined ? {} : { provider }),
    ...(name === undefined ? {} : { name }),
    ...(thinking === undefined ? {} : { thinking }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(maxTokens === undefined
      ? {}
      : {
          maxTokens: positiveInteger(
            maxTokens,
            "manifest model.max_tokens is invalid",
          ),
        }),
  };
}

function parseHandoff(value: unknown): NonNullable<AgentManifest["handoff"]> {
  const input = record(value, "manifest handoff is invalid");
  return {
    canDelegateTo: strings(
      input.can_delegate_to ?? [],
      "manifest handoff.can_delegate_to is invalid",
    ),
    acceptsFrom: strings(
      input.accepts_from ?? [],
      "manifest handoff.accepts_from is invalid",
    ),
  };
}

function parseMcpServers(
  value: unknown,
): Readonly<Record<string, McpServerConfig>> {
  const input = record(value, "manifest mcp_servers is invalid");
  const entries = Object.entries(input).map(
    ([name, config]): [string, McpServerConfig] => {
      const server = record(config, `manifest mcp server ${name} is invalid`);
      const discoveryAllowlist = strings(
        server.discovery_allowlist ?? [],
        `manifest mcp server ${name} discovery_allowlist is invalid`,
      );
      if (typeof server.command === "string")
        return [
          name,
          {
            kind: "stdio",
            command: server.command,
            args: strings(
              server.args ?? [],
              `manifest mcp server ${name} args is invalid`,
            ),
            env: stringRecord(
              server.env ?? {},
              `manifest mcp server ${name} env is invalid`,
            ),
            discoveryAllowlist,
          },
        ];
      return [
        name,
        {
          kind: "remote",
          url: requiredString(
            server.url,
            `manifest mcp server ${name} url is required`,
          ),
          headers: stringRecord(
            server.headers ?? {},
            `manifest mcp server ${name} headers is invalid`,
          ),
          discoveryAllowlist,
        },
      ];
    },
  );
  return Object.fromEntries(entries);
}

function parseClientTools(value: unknown): readonly ClientToolSpec[] {
  if (!Array.isArray(value))
    throw new Error("manifest client_tools is invalid");
  return value.map((entry) => {
    const input = record(entry, "manifest client tool is invalid");
    const parameters = input.parameters ?? { type: "object", properties: {} };
    if (!isJsonObject(parameters))
      throw new Error("manifest client tool parameters is invalid");
    return {
      name: requiredString(input.name, "manifest client tool name is required"),
      description: requiredString(
        input.description,
        "manifest client tool description is required",
      ),
      parameters,
    };
  });
}

export function confinedWorkspacePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === ".." || part === "")
  )
    throw new Error("manifest prompt path escapes agents directory");
  return normalized;
}

export function manifestName(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(value))
    throw new Error("manifest name must be lowercase kebab-case");
  return value;
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(message);
  return value as Record<string, unknown>;
}

function strings(value: unknown, message: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(message);
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") throw new Error(message);
    result.push(entry);
  }
  return result;
}

function stringRecord(
  value: unknown,
  message: string,
): Readonly<Record<string, string>> {
  const input = record(value, message);
  if (Object.values(input).some((entry) => typeof entry !== "string"))
    throw new Error(message);
  return input as Record<string, string>;
}

function booleanRecord(
  value: unknown,
  message: string,
): Readonly<Record<string, boolean>> {
  const input = record(value, message);
  if (Object.values(input).some((entry) => typeof entry !== "boolean"))
    throw new Error(message);
  return input as Record<string, boolean>;
}

function requiredString(value: unknown, message: string): string {
  const result = optionalString(value);
  if (!result) throw new Error(message);
  return result;
}

function inputString(value: unknown, message: string): string {
  return requiredString(value, message);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function booleanValue(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") throw new Error(message);
  return value;
}

function positiveInteger(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw new Error(message);
  return value;
}

function positiveNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error(message);
  return value;
}

function enumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  message: string,
): T {
  if (!allowed.includes(value as T)) throw new Error(message);
  return value as T;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown parse error";
}
