import type { RuntimeOptionalToolResolver } from "@application/runtime";
import type { SkillPort } from "@application/shared/ports/index.js";
import type { GlobalSkillSource, SkillService } from "@application/skill";
import { composeSkillSources, createSkillService } from "@application/skill";
import { resolve } from "node:path";
import { loadRepositorySkills } from "@infrastructure/skill/repository-skill-loader.js";
import {
  createHttpRequestTool,
  composeRuntimeToolPorts,
  createOptionalRuntimeTools,
  createStateTool,
  toolPortToMinderTool,
  type RuntimeToolRegistries,
} from "@infrastructure/tools/impl";
import { builtInSkillSource } from "@infrastructure/skill/builtin/index.js";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import type { CompositionOptions } from "./types.js";

export function createRuntimeToolRegistries(
  options: CompositionOptions | undefined,
): RuntimeToolRegistries {
  const allowedHosts = (options?.environment.MINDER_HTTP_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
  const sharedToolPorts = [
    createStateTool(),
    ...(allowedHosts.length === 0
      ? []
      : [
          createHttpRequestTool({
            allowedHosts,
            fetch: async (url, init) => {
              const response = await (options?.fetch ?? globalThis.fetch)(url, {
                method: init.method,
                ...(init.headers === undefined
                  ? {}
                  : { headers: init.headers }),
                ...(init.body === undefined ? {} : { body: init.body }),
              });
              return { status: response.status, body: await response.text() };
            },
          }),
        ]),
  ];
  return composeRuntimeToolPorts({
    interactive: sharedToolPorts,
    autonomous: sharedToolPorts,
  });
}

export function createSkillServiceForOwner(
  skillStore: ((owner: string) => SkillPort) | undefined,
  globalSkills: GlobalSkillSource = builtInSkillSource,
): ((owner: string) => SkillService) | undefined {
  if (skillStore === undefined) return undefined;
  const repositorySkills = loadRepositorySkills(
    resolve(process.cwd(), ".agents/skills"),
  );
  const allGlobalSkills = composeSkillSources(globalSkills, {
    list: () => repositorySkills,
  });
  const services = new Map<string, SkillService>();
  return (owner) => {
    const existing = services.get(owner);
    if (existing !== undefined) return existing;
    const service = createSkillService({
      store: skillStore(owner),
      globalSkills: allGlobalSkills.list(),
      sha256,
    });
    services.set(owner, service);
    return service;
  };
}

export function createOptionalToolResolver(
  skillServiceForOwner: ((owner: string) => SkillService) | undefined,
): RuntimeOptionalToolResolver | undefined {
  if (skillServiceForOwner === undefined) return undefined;
  return ({ owner, skills }) =>
    createOptionalRuntimeTools({
      allowedSkills: skills,
      skills: {
        list: async () =>
          skillServiceForOwner(owner).list({ allowlist: skills }),
        resolve: async ({ name }) => {
          const skill = await skillServiceForOwner(owner).resolve({
            name,
            allowlist: skills,
          });
          if (skill === undefined) return undefined;
          return {
            body: skill.body,
            ...(skill.source === "global"
              ? {
                  resourcePath: `/usr/share/minder/skills/${skill.name}/`,
                }
              : {}),
          };
        },
      },
    }).map(toolPortToMinderTool);
}
