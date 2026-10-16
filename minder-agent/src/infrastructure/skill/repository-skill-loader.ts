import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import type { GlobalSkillInput } from "@application/skill";

const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

function assertNoSymlinks(root: string, current: string): void {
  for (const name of readdirSync(current)) {
    const path = join(current, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`${relative(root, path)}: symlinks are not allowed`);
    }
    if (stat.isDirectory()) assertNoSymlinks(root, path);
  }
}

function packageError(path: string, reason: string): never {
  throw new Error(`${path}: ${reason}`);
}

function loadSkill(root: string, directory: string): GlobalSkillInput {
  const skillDirectory = join(root, directory);
  const skillFile = join(skillDirectory, "SKILL.md");
  let source: string;
  try {
    source = readFileSync(skillFile, "utf8");
  } catch {
    return packageError(directory, "SKILL.md is required");
  }

  const match = FRONTMATTER.exec(source);
  if (!match) return packageError(directory, "invalid SKILL.md frontmatter");

  let metadata: unknown;
  try {
    metadata = parse(match[1] ?? "");
  } catch {
    return packageError(directory, "invalid SKILL.md frontmatter YAML");
  }
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return packageError(directory, "frontmatter must be a YAML mapping");
  }

  const values = metadata as Record<string, unknown>;
  const name = values.name;
  const description = values.description;
  const namespace = values.namespace === undefined ? "" : values.namespace;
  const body = match[2] ?? "";
  if (typeof name !== "string" || !SKILL_NAME.test(name)) {
    return packageError(directory, "name must be lowercase kebab-case");
  }
  if (name !== directory) {
    return packageError(directory, "name must match the skill directory");
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    return packageError(directory, "description is required");
  }
  if (
    typeof namespace !== "string" ||
    !/^(?:[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*)?$/.test(namespace)
  ) {
    return packageError(
      directory,
      "namespace must be lowercase dot-separated identifiers",
    );
  }
  if (body.trim().length === 0)
    return packageError(directory, "instruction body is required");

  return { name, description, namespace, body: body.trim() };
}

export function loadRepositorySkills(
  root: string,
): readonly GlobalSkillInput[] {
  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch {
    throw new Error(`${root}: global skill directory not found`);
  }
  if (rootStat.isSymbolicLink())
    throw new Error(`${root}: symlinks are not allowed`);
  if (!rootStat.isDirectory())
    throw new Error(`${root}: global skill path must be a directory`);

  const skills: GlobalSkillInput[] = [];
  const names = new Set<string>();
  for (const entry of readdirSync(root).sort()) {
    const path = join(root, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`${entry}: symlinks are not allowed`);
    }
    if (!stat.isDirectory()) continue;
    assertNoSymlinks(root, path);
    const skill = loadSkill(root, entry);
    if (names.has(skill.name))
      packageError(entry, `duplicate skill name '${skill.name}'`);
    names.add(skill.name);
    skills.push(skill);
  }
  return skills;
}
