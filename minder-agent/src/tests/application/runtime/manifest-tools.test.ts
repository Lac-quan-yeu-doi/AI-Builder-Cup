import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { resolve } from "node:path";
import { ToolRegistry } from "@infrastructure/tools/core";
import { applyManifestToolPolicy } from "@application/runtime/governance/manifest-tools.js";
import { loadRepositorySkills } from "@infrastructure/skill/repository-skill-loader.js";

const registry = new ToolRegistry([
  {
    name: "Read",
    description: "read",
    parameters: { type: "object", properties: {} },
    aliases: ["read_file"],
    readOnly: true,
  },
  {
    name: "Bash",
    description: "run shell command",
    parameters: { type: "object", properties: {} },
    aliases: [],
    readOnly: false,
  },
  {
    name: "Write",
    description: "write",
    parameters: { type: "object", properties: {} },
    aliases: [],
    readOnly: false,
  },
]);

describe("manifest tool policy", () => {
  it("keeps Google Drive guidance in a repository skill", async () => {
    const assistant = parse(
      await readFile("agents/chat-assistant.yaml", "utf8"),
    ) as {
      system_prompt: string;
      tools: { names: string[] };
    };
    const googleDrive = loadRepositorySkills(
      resolve(process.cwd(), ".agents/skills"),
    ).find((skill) => skill.name === "google-drive");

    expect(assistant.system_prompt).not.toContain("search_files");
    expect(googleDrive?.body).toContain("search_files");
    expect(assistant.tools.names).toContain("mcp__google_drive__search_files");
  });

  it("keeps Bash opt-in except for the default chat assistant", async () => {
    const filtered = applyManifestToolPolicy(registry, {
      mode: "allowlist",
      names: ["Read"],
    });
    expect(filtered.all().map((tool) => tool.name)).toEqual(["Read"]);

    const assistant = parse(
      await readFile("agents/chat-assistant.yaml", "utf8"),
    ) as {
      tools: { names: string[] };
      governance: { auto_approvals: string[] };
    };
    expect(assistant.tools.names).toContain("Bash");
    expect(assistant.governance.auto_approvals).toEqual(["*"]);
  });

  it("selects canonical names and aliases without changing the shared registry", () => {
    const filtered = applyManifestToolPolicy(registry, {
      mode: "allowlist",
      names: ["read_file"],
    });

    expect(filtered.all().map((tool) => tool.name)).toEqual(["Read"]);
    expect(registry.all().map((tool) => tool.name)).toEqual([
      "Read",
      "Bash",
      "Write",
    ]);
  });

  it("supports denylist and all modes", () => {
    expect(
      applyManifestToolPolicy(registry, { mode: "denylist", names: ["Read"] })
        .all()
        .map((tool) => tool.name),
    ).toEqual(["Bash", "Write"]);
    expect(
      applyManifestToolPolicy(registry, { mode: "all", names: [] }).all(),
    ).toHaveLength(3);
  });
});
