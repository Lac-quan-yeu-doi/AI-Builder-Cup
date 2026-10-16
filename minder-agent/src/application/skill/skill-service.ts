import {
  skillName,
  type SkillDefinition,
  type SkillName,
} from "@domain/index.js";
import type { Sha256, SkillPort } from "@application/shared/ports/index.js";

export interface SkillSummary {
  readonly name: string;
  readonly description?: string;
  readonly namespace: string;
  readonly source: SkillDefinition["source"];
  readonly readOnly: boolean;
}

export interface ProjectSkillInput {
  readonly name: string;
  readonly description?: string;
  readonly namespace: string;
  readonly body: string;
}

export type GlobalSkillInput = ProjectSkillInput;

export interface SkillService {
  readonly deleteProject: (name: string) => Promise<void>;
  readonly createProject: (
    input: ProjectSkillInput,
  ) => Promise<SkillDefinition>;
  readonly list: (input?: {
    readonly allowlist?: readonly string[];
  }) => Promise<readonly SkillSummary[]>;
  readonly resolve: (input: {
    readonly name: string;
    readonly allowlist?: readonly string[];
  }) => Promise<SkillDefinition | undefined>;
  readonly saveProject: (input: ProjectSkillInput) => Promise<SkillDefinition>;
}

const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;
const NAMESPACE = /^(?:[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*)?$/;

function assertInput(input: ProjectSkillInput): void {
  if (!SKILL_NAME.test(input.name))
    throw new Error("skill name must be lowercase kebab-case");
  if (!NAMESPACE.test(input.namespace))
    throw new Error(
      "skill namespace must be lowercase dot-separated identifiers",
    );
  if (input.body.trim().length === 0) throw new Error("skill body is required");
}

function createSkill(
  input: ProjectSkillInput,
  source: "global" | "project",
  now: string,
  sha256: Sha256,
): SkillDefinition {
  assertInput(input);
  return {
    body: input.body,
    createdAt: now,
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    hash: sha256(input.body),
    name: skillName(input.name),
    namespace: input.namespace,
    readOnly: source === "global",
    source,
    updatedAt: now,
  };
}

function allowed(name: string, allowlist?: readonly string[]): boolean {
  return (
    allowlist === undefined ||
    allowlist.length === 0 ||
    allowlist.includes("*") ||
    allowlist.includes(name)
  );
}

function summary(skill: SkillDefinition): SkillSummary {
  return {
    ...(skill.description === undefined
      ? {}
      : { description: skill.description }),
    name: skill.name,
    namespace: skill.namespace,
    readOnly: skill.readOnly,
    source: skill.source,
  };
}

export function createSkillService(input: {
  readonly globalSkills?: readonly GlobalSkillInput[];
  readonly store: SkillPort;
  readonly sha256: Sha256;
  readonly now?: () => string;
}): SkillService {
  const now = input.now ?? (() => new Date().toISOString());
  const globalSkills = new Map<SkillName, SkillDefinition>(
    (input.globalSkills ?? []).map((skill) => {
      const value = createSkill(skill, "global", now(), input.sha256);
      return [value.name, value];
    }),
  );
  const global = (name: string): SkillDefinition | undefined =>
    globalSkills.get(skillName(name));
  return {
    async deleteProject(name) {
      if (global(name)) throw new Error("global skills are read-only");
      await input.store.delete(skillName(name));
    },
    async createProject(skill) {
      if (global(skill.name)) throw new Error("skill_name_conflict");
      const value = createSkill(skill, "project", now(), input.sha256);
      if (!(await input.store.create(value)))
        throw new Error("skill_name_conflict");
      return value;
    },
    async list(options = {}) {
      const visible = new Map<SkillName, SkillDefinition>();
      for (const skill of await input.store.list())
        visible.set(skill.name, skill);
      for (const skill of globalSkills.values()) visible.set(skill.name, skill);
      return [...visible.values()]
        .filter((skill) => allowed(skill.name, options.allowlist))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(summary);
    },
    async resolve(options) {
      if (!allowed(options.name, options.allowlist)) return undefined;
      return global(options.name) ?? input.store.get(skillName(options.name));
    },
    async saveProject(skill) {
      if (global(skill.name)) throw new Error("global skills are read-only");
      const existing = await input.store.get(skillName(skill.name));
      const timestamp = now();
      const next = createSkill(
        skill,
        "project",
        existing?.createdAt ?? timestamp,
        input.sha256,
      );
      const value = { ...next, updatedAt: timestamp };
      await input.store.save(value);
      return value;
    },
  };
}
