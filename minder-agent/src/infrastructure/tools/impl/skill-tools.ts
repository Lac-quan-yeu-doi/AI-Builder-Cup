import type { ToolDescriptor } from "@application/shared/ports/index.js";
import { executableTool, requiredStringArgument } from "./executable-tool.js";
import { allowAll, type ToolPolicy } from "./policy.js";

export interface SkillCatalogEntry {
  readonly name: string;
  readonly description?: string;
  readonly namespace: string;
  readonly source: string;
  readonly readOnly: boolean;
}

export interface SkillCatalog {
  list(): Promise<readonly SkillCatalogEntry[]>;
}

const catalogDescriptor: ToolDescriptor = {
  name: "ListSkills",
  description: "List reusable skills available to this assistant.",
  parameters: { type: "object", properties: {} },
  category: "meta",
  readOnly: true,
  destructive: false,
  aliases: ["list_skills"],
};

export function createSkillCatalogTool(
  catalog: SkillCatalog,
  policy: ToolPolicy = allowAll,
) {
  return executableTool(catalogDescriptor, policy, async () => {
    const skills = await catalog.list();
    return {
      success: true,
      content: JSON.stringify(skills),
      metadata: { count: skills.length },
    };
  });
}

export interface SkillInvoker {
  invoke(input: {
    readonly name: string;
  }): Promise<{ body: string; resourcePath?: string } | undefined>;
}

const descriptor: ToolDescriptor = {
  name: "InvokeSkill",
  description: "Load an allowed skill's instructions into the run.",
  parameters: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
  },
  category: "meta",
  readOnly: true,
  destructive: false,
  aliases: ["invoke_skill"],
};

/**
 * Executable InvokeSkill tool. It resolves an allowed skill's body; an unknown
 * or disallowed skill returns a stable failure rather than leaking existence.
 */
export function createSkillTool(
  invoker: SkillInvoker,
  policy: ToolPolicy = allowAll,
) {
  return executableTool(
    descriptor,
    policy,
    async (args) => {
      const name = requiredStringArgument(args, "name");
      const skill = await invoker.invoke({ name });
      if (!skill)
        return {
          success: false,
          content: `Skill '${name}' is not available.`,
          metadata: { name },
        };
      const resourcePath = skill.resourcePath;
      return {
        success: true,
        content:
          resourcePath === undefined
            ? skill.body
            : `Sandbox resources: ${resourcePath} (read-only).\n\n${skill.body}`,
        metadata: {
          name,
          ...(resourcePath === undefined ? {} : { resourcePath }),
        },
      };
    },
    { outputLimit: 40_000 },
  );
}
