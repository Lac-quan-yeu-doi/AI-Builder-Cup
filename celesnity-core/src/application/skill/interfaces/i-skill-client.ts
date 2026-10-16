/**
 * Application-layer boundary for the project-skill store. The concrete
 * implementation lives in the infrastructure layer
 * (`MinderAgentSkillClient`, an HTTP proxy to minder-agent's `/skills` API),
 * but presentation depends only on this port so it never reaches across the
 * clean-architecture boundary into infrastructure directly (enforced by the
 * `no-restricted-imports` eslint rule for `src/presentation/**`).
 */

export const SKILL_CLIENT = Symbol('SKILL_CLIENT');

/**
 * A skill as it appears in a listing — the subset minder-agent's `/skills`
 * surface returns. `source` distinguishes a project-local skill (writable)
 * from a user-global one (read-only).
 */
export interface SkillSummary {
  readonly name: string;
  readonly description: string;
  readonly namespace: string;
  readonly source: 'project' | 'global';
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

/** Raised when the skill store rejects a request (bad name, name taken, not found, unreachable). */
export class SkillClientError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SkillClientError';
  }
}

/** Port for reading and writing project skills. */
export interface ISkillClient {
  list(): Promise<readonly SkillSummary[]>;
  /** Resolves `undefined` when no skill by that name exists (a 404 upstream). */
  get(name: string): Promise<SkillDetail | undefined>;
  create(input: CreateSkillInput): Promise<SkillDetail>;
  update(input: UpdateSkillInput): Promise<SkillDetail>;
  delete(name: string): Promise<void>;
}
