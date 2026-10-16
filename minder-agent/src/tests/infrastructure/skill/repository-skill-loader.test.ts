import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRepositorySkills } from "@infrastructure/skill/repository-skill-loader.js";

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "minder-skills-"));
  roots.push(root);
  return root;
}

async function writeSkill(
  root: string,
  directory: string,
  content: string,
): Promise<void> {
  const skillDirectory = join(root, directory);
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(join(skillDirectory, "SKILL.md"), content, "utf8");
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("loadRepositorySkills", () => {
  it("loads immediate skill folders and defaults an omitted namespace", async () => {
    const root = await createRoot();
    await writeSkill(
      root,
      "humanizer",
      "---\nname: humanizer\ndescription: Rewrite prose.\nnamespace: writing\n---\nInstructions.\n",
    );
    await writeSkill(
      root,
      "pdf-report",
      "---\nname: pdf-report\ndescription: Create reports.\n---\nRender a report.\n",
    );
    await mkdir(join(root, "humanizer", "references"), { recursive: true });
    await writeFile(
      join(root, "humanizer", "references", "guide.md"),
      "Reference.",
      "utf8",
    );

    expect(loadRepositorySkills(root)).toEqual([
      {
        name: "humanizer",
        description: "Rewrite prose.",
        namespace: "writing",
        body: "Instructions.",
      },
      {
        name: "pdf-report",
        description: "Create reports.",
        namespace: "",
        body: "Render a report.",
      },
    ]);
  });

  it("rejects a missing root with the source path", async () => {
    const root = await createRoot();

    expect(() => loadRepositorySkills(join(root, "missing"))).toThrow(
      /missing.*not found/i,
    );
  });

  it.each([
    ["missing SKILL.md", "humanizer", undefined, /humanizer.*SKILL\.md/i],
    [
      "invalid frontmatter",
      "humanizer",
      "---\nname: [bad\n---\nBody",
      /humanizer.*frontmatter/i,
    ],
    [
      "missing description",
      "humanizer",
      "---\nname: humanizer\n---\nBody",
      /humanizer.*description/i,
    ],
    [
      "invalid namespace",
      "humanizer",
      "---\nname: humanizer\ndescription: Valid.\nnamespace: null\n---\nBody",
      /humanizer.*namespace/i,
    ],
    [
      "invalid skill name",
      "Humanizer",
      "---\nname: Humanizer\ndescription: Valid.\n---\nBody",
      /Humanizer.*name/i,
    ],
    [
      "directory mismatch",
      "humanizer",
      "---\nname: other\ndescription: Valid.\n---\nBody",
      /humanizer.*directory/i,
    ],
    [
      "empty body",
      "humanizer",
      "---\nname: humanizer\ndescription: Valid.\n---\n  \n",
      /humanizer.*body/i,
    ],
  ])("rejects %s", async (_caseName, directory, content, expected) => {
    const root = await createRoot();
    if (content !== undefined) await writeSkill(root, directory, content);
    else await mkdir(join(root, directory), { recursive: true });

    expect(() => loadRepositorySkills(root)).toThrow(expected);
  });

  it("rejects a symlinked skill package", async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await writeSkill(
      outside,
      "humanizer",
      "---\nname: humanizer\ndescription: Rewrite prose.\n---\nInstructions.\n",
    );
    await symlink(join(outside, "humanizer"), join(root, "humanizer"), "dir");

    expect(() => loadRepositorySkills(root)).toThrow(/humanizer.*symlink/i);
  });

  it("rejects a symlinked resource nested inside a skill package", async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await writeSkill(
      root,
      "humanizer",
      "---\nname: humanizer\ndescription: Rewrite prose.\n---\nInstructions.\n",
    );
    await writeFile(join(outside, "secret.txt"), "secret", "utf8");
    await symlink(
      join(outside, "secret.txt"),
      join(root, "humanizer", "secret.txt"),
    );

    expect(() => loadRepositorySkills(root)).toThrow(/humanizer.*symlink/i);
  });
});
