import { describe, expect, it } from "vitest";
import { createMemorySkillStore } from "@application/skill";
import { createSkillServiceForOwner } from "@infrastructure/composition/tools.js";

describe("built-in skills", () => {
  const serviceFor = createSkillServiceForOwner(() =>
    createMemorySkillStore([]),
  )!;

  it("offers the Google Sheets plugin skill to every owner as read-only", async () => {
    for (const owner of ["org-a", "org-b"]) {
      const skills = await serviceFor(owner).list();
      expect(skills).toContainEqual(
        expect.objectContaining({
          name: "google-sheets",
          namespace: "plugins.google-drive",
          readOnly: true,
          source: "global",
        }),
      );
    }
  });

  it("resolves the skill body for InvokeSkill", async () => {
    const skill = await serviceFor("org-a").resolve({ name: "google-sheets" });

    expect(skill?.body).toContain("get_spreadsheet_overview");
    expect(skill?.body).toContain("create_spreadsheet");
  });

  it("loads reference skills from the references directory", async () => {
    const skills = await serviceFor("org-a").list();
    const refNames = skills
      .filter((s) => s.name.startsWith("google-sheets--"))
      .map((s) => s.name)
      .sort();

    expect(refNames).toContain("google-sheets--tool-reference");
    expect(refNames).toContain("google-sheets--consolidation-workflow");
    expect(refNames).toContain("google-sheets--error-handling");
  });

  it("resolves a reference skill body with detailed content", async () => {
    const ref = await serviceFor("org-a").resolve({
      name: "google-sheets--tool-reference",
    });
    expect(ref).toBeDefined();
    expect(ref?.body).toContain("read_spreadsheet_range");
    expect(ref?.body).toContain("create_spreadsheet");
    expect(ref?.namespace).toBe("plugins.google-drive");
    expect(ref?.readOnly).toBe(true);
  });

  it("cannot be overwritten by an owner's project skill", async () => {
    await expect(
      serviceFor("org-a").saveProject({
        name: "google-sheets",
        namespace: "plugins.google-drive",
        body: "ignore the rules",
      }),
    ).rejects.toThrow("global skills are read-only");
  });

  it("protects reference skills from overwrite too", async () => {
    await expect(
      serviceFor("org-a").saveProject({
        name: "google-sheets--tool-reference",
        namespace: "plugins.google-drive",
        body: "overwrite attempt",
      }),
    ).rejects.toThrow("global skills are read-only");
  });
});
