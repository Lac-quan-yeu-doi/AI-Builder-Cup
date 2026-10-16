import { describe, expect, it } from "vitest";
import { generateSkillIndex } from "@application/skill/skill-index.js";

describe("generateSkillIndex", () => {
  it("returns undefined when there are no skills", () => {
    expect(generateSkillIndex([])).toBeUndefined();
  });

  it("includes only top-level skills (no references)", () => {
    const skills = [
      {
        name: "google-drive",
        namespace: "plugins.google-drive",
        description: "Top-level router",
        body: "",
      },
      {
        name: "google-sheets",
        namespace: "plugins.google-drive",
        description: "Read and create spreadsheets",
        body: "",
      },
      {
        name: "google-sheets--read-safety",
        namespace: "plugins.google-drive",
        description: "Safe read practices",
        body: "",
      },
      {
        name: "google-sheets--error-handling",
        namespace: "plugins.google-drive",
        description: "Error codes",
        body: "",
      },
    ];
    const result = generateSkillIndex(skills)!;
    expect(result).toContain("google-drive");
    expect(result).toContain("google-sheets:");
    expect(result).not.toContain("google-sheets--read-safety");
    expect(result).not.toContain("google-sheets--error-handling");
  });

  it("generates correct format", () => {
    const skills = [
      {
        name: "google-drive",
        namespace: "plugins.google-drive",
        description: "Top-level router for Drive",
        body: "",
      },
    ];
    const result = generateSkillIndex(skills)!;
    expect(result).toContain("## Connected third-party services");
    expect(result).toContain('InvokeSkill("{name}")');
    expect(result).toContain("- google-drive: Top-level router for Drive");
  });

  it("returns undefined when all skills are references", () => {
    const skills = [
      {
        name: "google-sheets--read-safety",
        namespace: "plugins.google-drive",
        description: "Safe reads",
        body: "",
      },
    ];
    expect(generateSkillIndex(skills)).toBeUndefined();
  });

  it("excludes non-plugin namespace skills", () => {
    const skills = [
      {
        name: "trino-chart",
        namespace: "analytics",
        description: "Chart tool",
        body: "",
      },
      {
        name: "google-drive",
        namespace: "plugins.google-drive",
        description: "Drive router",
        body: "",
      },
      {
        name: "core-documents",
        namespace: "documents",
        description: "Internal docs",
        body: "",
      },
    ];
    const result = generateSkillIndex(skills)!;
    expect(result).toContain("google-drive");
    expect(result).not.toContain("trino-chart");
    expect(result).not.toContain("core-documents");
  });
});
