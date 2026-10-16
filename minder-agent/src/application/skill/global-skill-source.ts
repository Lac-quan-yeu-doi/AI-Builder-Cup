import type { GlobalSkillInput } from "./skill-service.js";

export interface GlobalSkillSource {
  list(): readonly GlobalSkillInput[];
}

export function composeSkillSources(
  ...sources: readonly GlobalSkillSource[]
): GlobalSkillSource {
  return {
    list() {
      const merged = new Map<string, GlobalSkillInput>();
      for (const source of sources)
        for (const skill of source.list()) merged.set(skill.name, skill);
      return [...merged.values()];
    },
  };
}
