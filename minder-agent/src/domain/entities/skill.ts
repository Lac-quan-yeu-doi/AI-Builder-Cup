import type { SkillName } from "../values/ids.js";

export interface SkillDefinition {
  readonly name: SkillName;
  readonly description?: string;
  readonly namespace: string;
  readonly body: string;
  readonly source: "global" | "project" | "manifest";
  readonly readOnly: boolean;
  readonly hash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
