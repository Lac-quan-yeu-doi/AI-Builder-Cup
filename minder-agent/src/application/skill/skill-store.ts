import type { SkillDefinition, SkillName } from "@domain/index.js";
import type { SkillPort } from "@application/shared/ports/index.js";

export function createMemorySkillStore(
  initial: readonly SkillDefinition[] = [],
): SkillPort {
  const skills = new Map<SkillName, SkillDefinition>(
    initial.map((skill) => [skill.name, skill]),
  );
  return {
    async create(skill) {
      await Promise.resolve();
      if (skills.has(skill.name)) return false;
      skills.set(skill.name, skill);
      return true;
    },
    async delete(name) {
      await Promise.resolve();
      skills.delete(name);
    },
    async get(name) {
      await Promise.resolve();
      return skills.get(name);
    },
    async list() {
      await Promise.resolve();
      return [...skills.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    },
    async save(skill) {
      await Promise.resolve();
      skills.set(skill.name, skill);
    },
  };
}
