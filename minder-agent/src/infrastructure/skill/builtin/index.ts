import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import type { GlobalSkillSource } from "@application/skill/global-skill-source.js";
import type { GlobalSkillInput } from "@application/skill/skill-service.js";

export interface SkillFileSystem {
  listDirectories(dir: string): readonly string[];
  listFiles(dir: string, extension: string): readonly string[];
  readFile(path: string): string | undefined;
  exists(path: string): boolean;
}

export const nodeFileSystem: SkillFileSystem = {
  listDirectories(dir) {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }
  },
  listFiles(dir, extension) {
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith(extension))
        .sort();
    } catch {
      return [];
    }
  },
  readFile(path) {
    try {
      return readFileSync(path, "utf-8");
    } catch {
      return undefined;
    }
  },
  exists: existsSync,
};

interface SkillFrontmatter {
  readonly name: string;
  readonly namespace: string;
  readonly description?: string;
}

export function parseFrontmatter(raw: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const fence = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fence) throw new Error("SKILL.md must start with YAML frontmatter");

  const fields: Record<string, string> = {};
  let key = "";
  let value = "";
  for (const line of fence[1]!.split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kv) {
      if (key) fields[key] = value.trim();
      key = kv[1]!;
      value = kv[2]!.replace(/^>-?\s*$/, "");
    } else if (key) {
      value += " " + line.trim();
    }
  }
  if (key) fields[key] = value.trim();

  if (!fields.name || !fields.namespace)
    throw new Error("SKILL.md frontmatter requires name and namespace");
  return {
    frontmatter: {
      name: fields.name,
      namespace: fields.namespace,
      ...(fields.description ? { description: fields.description } : {}),
    },
    body: fence[2]!.trimStart(),
  };
}

function loadReferences(
  dir: string,
  parent: SkillFrontmatter,
  fs: SkillFileSystem,
): readonly GlobalSkillInput[] {
  const refsDir = join(dir, "references");
  if (!fs.exists(refsDir)) return [];

  const results: GlobalSkillInput[] = [];

  for (const entry of fs.listDirectories(refsDir)) {
    const refSkill = join(refsDir, entry, "SKILL.md");
    const raw = fs.readFile(refSkill);
    if (!raw) continue;
    const { frontmatter, body } = parseFrontmatter(raw);
    results.push({ ...frontmatter, body });
  }

  for (const file of fs.listFiles(refsDir, ".md")) {
    const raw = fs.readFile(join(refsDir, file));
    if (!raw) continue;
    const slug = basename(file, ".md");
    const refName = `${parent.name}--${slug}`;

    const hasFrontmatter = raw.startsWith("---\n");
    if (hasFrontmatter) {
      const { frontmatter, body } = parseFrontmatter(raw);
      results.push({
        name: frontmatter.name ?? refName,
        namespace: frontmatter.namespace ?? parent.namespace,
        ...(frontmatter.description
          ? { description: frontmatter.description }
          : {}),
        body,
      });
    } else {
      results.push({
        name: refName,
        namespace: parent.namespace,
        description: `Reference: ${slug} (part of ${parent.name})`,
        body: raw,
      });
    }
  }

  return results;
}

function loadSkillsFromDirectory(
  dir: string,
  fs: SkillFileSystem,
): readonly GlobalSkillInput[] {
  const skills: GlobalSkillInput[] = [];

  for (const entry of fs.listDirectories(dir)) {
    const skillPath = join(dir, entry, "SKILL.md");
    const raw = fs.readFile(skillPath);
    if (!raw) continue;

    const { frontmatter, body } = parseFrontmatter(raw);
    skills.push({ ...frontmatter, body });
    skills.push(...loadReferences(join(dir, entry), frontmatter, fs));
  }

  return skills;
}

const DEFAULT_RUNTIME_SKILLS_DIR = resolve(
  import.meta.dirname ?? ".",
  "../../../../runtime-skills",
);

export function createBuiltInSkillSource(
  dir: string = DEFAULT_RUNTIME_SKILLS_DIR,
  fs: SkillFileSystem = nodeFileSystem,
): GlobalSkillSource {
  const skills = loadSkillsFromDirectory(dir, fs);
  return { list: () => skills };
}

export const builtInSkillSource: GlobalSkillSource = createBuiltInSkillSource();
