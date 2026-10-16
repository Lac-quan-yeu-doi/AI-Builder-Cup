import type { SkillDefinition } from "@domain/index.js";
export interface SkillCatalog {
  list(): Promise<readonly SkillDefinition[]>;
}
