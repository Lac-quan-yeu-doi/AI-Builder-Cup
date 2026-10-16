export interface SkillLoader {
  load(source: string): Promise<string>;
}
