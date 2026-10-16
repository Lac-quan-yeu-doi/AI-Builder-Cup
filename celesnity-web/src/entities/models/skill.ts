export type SkillSource = 'project' | 'global';

export interface SkillSummary {
  readonly name: string;
  readonly description: string;
  readonly namespace: string;
  readonly source: SkillSource;
}

export interface SkillDetail extends SkillSummary {
  readonly body: string;
}

export interface CreateSkillInput {
  readonly name: string;
  readonly description: string;
  readonly namespace: string;
  readonly body: string;
}

export interface UpdateSkillInput {
  readonly name: string;
  readonly description: string;
  readonly namespace: string;
  readonly body: string;
}
