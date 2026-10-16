import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveInstructions } from "@infrastructure/context";

const temporaryDirectories: string[] = [];

async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "minder-context-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      const { rm } = await import("node:fs/promises");
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe("resolveInstructions", () => {
  it("collects applicable files from root to leaf in deterministic precedence order", async () => {
    const root = await workspace();
    const child = join(root, "apps", "api");
    await mkdir(join(root, ".minder", "rules"), { recursive: true });
    await mkdir(child, { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "root agents");
    await writeFile(join(root, "CLAUDE.md"), "root claude");
    await writeFile(
      join(root, ".minder", "instructions.md"),
      "<!-- hidden -->\nroot minder",
    );
    await writeFile(join(root, ".minder", "rules", "20-z.md"), "z rule");
    await writeFile(join(root, ".minder", "rules", "10-a.mdc"), "a rule");
    await writeFile(join(root, "AGENTS.local.md"), "root local");
    await writeFile(join(root, ".cursorrules"), "cursor rules");
    await writeFile(join(child, "AGENTS.md"), "child agents");

    const result = await resolveInstructions({
      projectRoot: root,
      workingDirectory: child,
    });

    expect(result.documents.map((document) => document.content)).toEqual([
      "root agents",
      "root claude",
      "root minder",
      "a rule",
      "z rule",
      "root local",
      "cursor rules",
      "child agents",
    ]);
    expect(result.documents.map((document) => document.scope)).toEqual([
      "project",
      "project",
      "project",
      "project",
      "project",
      "project",
      "project",
      "subdirectory",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("filters frontmatter paths, resolves root-confined includes before their includer, and keeps valid files after errors", async () => {
    const root = await workspace();
    await mkdir(join(root, ".minder"), { recursive: true });
    await mkdir(join(root, "apps"), { recursive: true });
    await writeFile(join(root, "shared.md"), "shared");
    await writeFile(join(root, "AGENTS.md"), "@include ./shared.md\nroot");
    await writeFile(
      join(root, ".minder", "instructions.md"),
      "---\npaths:\n  - apps/**\n---\nscoped",
    );
    await writeFile(
      join(root, "CLAUDE.local.md"),
      "@include ../../outside.md\nlocal",
    );

    const result = await resolveInstructions({
      projectRoot: root,
      workingDirectory: join(root, "apps"),
    });

    expect(result.documents.map((document) => document.content)).toEqual([
      "shared",
      "root",
      "scoped",
      "local",
    ]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "instruction_include_outside_root",
    });
  });
});
