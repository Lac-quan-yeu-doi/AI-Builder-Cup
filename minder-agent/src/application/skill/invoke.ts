import type { SkillName } from "@domain/index.js";
export interface InvokeSkillRequest {
  readonly name: SkillName;
}
