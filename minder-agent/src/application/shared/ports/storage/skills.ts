import type { SkillDefinition, SkillName } from "@domain/index.js";
export interface SkillPort {
  create(skill: SkillDefinition): Promise<boolean>;
  get(name: SkillName): Promise<SkillDefinition | undefined>;
  list(): Promise<readonly SkillDefinition[]>;
  save(skill: SkillDefinition): Promise<void>;
  delete(name: SkillName): Promise<void>;
}
