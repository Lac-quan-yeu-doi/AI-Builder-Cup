import type {
  CreateSkillInput,
  SkillDetail,
  SkillSummary,
  UpdateSkillInput,
} from '@/src/entities/models/skill';

export interface SkillRepository {
  list(): Promise<readonly SkillSummary[]>;
  get(name: string): Promise<SkillDetail>;
  create(input: CreateSkillInput): Promise<SkillDetail>;
  update(input: UpdateSkillInput): Promise<SkillDetail>;
  delete(name: string): Promise<void>;
}
