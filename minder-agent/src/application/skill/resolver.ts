import type { SkillDefinition, SkillName } from "@domain/index.js";
export interface SkillResolver {
  resolve(name: SkillName): Promise<SkillDefinition | undefined>;
}
