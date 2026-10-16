import type {
  AgentConfigurationStore,
  AgentConfigurationRecord,
} from "@application/agent";
import type { SkillService, SkillSummary } from "@application/skill";
import {
  type InstructionResolverPort,
  type InstructionResolution,
} from "@application/context";

export interface ProfileMcpDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
}

export interface McpDiscoveryInput {
  readonly callerId: string;
  readonly agentId: string;
}

/**
 * Services required to compose a caller-scoped execution profile. All are
 * optional at construction time so a runtime that only serves chat turns does
 * not need to configure control-plane storage.
 */
export interface ProfileServices {
  readonly agentConfigurations?: AgentConfigurationStore;
  readonly skills?: SkillService;
  /** Project root used to discover context instruction documents. */
  readonly projectRoot?: string;
  readonly instructionResolver?: InstructionResolverPort;
  /**
   * Optional scoped MCP discovery. Returns the tool descriptors visible to the
   * caller's principal scope; unconfigured discovery contributes no
   * descriptors. Discovery must already have enforced scope, so only authorized
   * descriptors reach the profile.
   */
  readonly mcpDiscovery?: (
    input: McpDiscoveryInput,
  ) => Promise<readonly ProfileMcpDescriptor[]>;
}

export interface ResolveProfileInput {
  readonly callerId: string;
  readonly agentId: string;
  /** Working-tree path the run will act on; used for path-scoped instructions. */
  readonly targetPath?: string;
}

/**
 * A run's resolved execution profile: the caller's agent configuration, the
 * ordered context instructions in scope, the skills the agent is allowed to
 * invoke, and the MCP descriptors visible within the caller's scope. Composing
 * this never issues a model request.
 */
export interface ResolvedAgentProfile {
  readonly agent: AgentConfigurationRecord["agent"];
  readonly version: number;
  readonly instructions: InstructionResolution;
  readonly skills: readonly SkillSummary[];
  readonly mcp: readonly ProfileMcpDescriptor[];
}

/**
 * Compose a caller-scoped {@link ResolvedAgentProfile}. Missing and foreign
 * agents are indistinguishable: both throw `agent_not_found`. Skill resolution
 * is limited to the agent's declared allowlist.
 */
export async function resolveProfile(
  services: ProfileServices,
  input: ResolveProfileInput,
): Promise<ResolvedAgentProfile> {
  if (!services.agentConfigurations)
    throw new Error("agent_configuration_not_configured");
  const record = await services.agentConfigurations.get(
    input.callerId,
    input.agentId,
  );
  if (!record) throw new Error("agent_not_found");

  const projectRoot = services.projectRoot ?? process.cwd();
  const instructions = services.instructionResolver
    ? await services.instructionResolver.resolve({
        projectRoot,
        ...(input.targetPath === undefined
          ? {}
          : { targetPath: input.targetPath }),
      })
    : { documents: [], diagnostics: [] };

  const allowlist = record.agent.skills ?? [];
  const skills = services.skills
    ? await services.skills.list({ allowlist })
    : [];

  const mcp = services.mcpDiscovery
    ? await services.mcpDiscovery({
        callerId: input.callerId,
        agentId: input.agentId,
      })
    : [];

  return {
    agent: record.agent,
    version: record.version,
    instructions,
    skills,
    mcp,
  };
}
