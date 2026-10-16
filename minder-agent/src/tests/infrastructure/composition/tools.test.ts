import { describe, expect, it } from "vitest";
import { createMemorySkillStore } from "@application/skill";
import { ToolRegistry } from "@infrastructure/tools/core";
import {
  createOptionalToolResolver,
  createSkillServiceForOwner,
} from "@infrastructure/composition/tools.js";

describe("built-in report skill", () => {
  it("loads the checked-in global skill catalog for every owner", async () => {
    const serviceForOwner = createSkillServiceForOwner(() =>
      createMemorySkillStore(),
    );
    const ownerSkills = await serviceForOwner?.("owner-1")?.list();
    const otherOwnerSkills = await serviceForOwner?.("owner-2")?.list();

    const ownerSkillNames = ownerSkills?.map(({ name }) => name);
    expect(ownerSkillNames).toEqual(otherOwnerSkills?.map(({ name }) => name));
    expect(ownerSkillNames).toEqual(
      expect.arrayContaining([
        "humanizer",
        "pdf-report",
        "typst",
        "google-drive",
      ]),
    );
  });

  it("derives the global resource path and ignores caller path arguments", async () => {
    const serviceForOwner = createSkillServiceForOwner(() =>
      createMemorySkillStore(),
    );
    const resolveTools = createOptionalToolResolver(serviceForOwner);
    const tools = await resolveTools?.({
      owner: "owner-1",
      runId: "run-1",
      skills: ["*"],
    });
    const invokeSkill = tools?.find(({ name }) => name === "InvokeSkill");

    expect(tools?.map(({ name }) => name)).toEqual([
      "ListSkills",
      "InvokeSkill",
    ]);
    expect(invokeSkill?.parameters).not.toHaveProperty(
      "properties.resourcePath",
    );
    const result = await new ToolRegistry(tools ?? []).execute(
      "InvokeSkill",
      { name: "humanizer", resourcePath: "/etc/passwd" },
      {
        workspaceRoot: "/tmp",
        workingDirectory: "/tmp",
        signal: new AbortController().signal,
      },
    );

    expect(result).toMatchObject({
      success: true,
      output: expect.stringContaining(
        "Sandbox resources: /usr/share/minder/skills/humanizer/ (read-only).",
      ),
      metadata: { resourcePath: "/usr/share/minder/skills/humanizer/" },
    });
    expect(result?.output.length).toBeGreaterThan(20_000);
    expect(result?.output).toContain(
      "The result tends toward the most statistically likely result that applies to the widest variety of cases.",
    );
    expect(result?.output).not.toContain("/etc/passwd");
  });

  it("is available as a read-only global skill to each owner", async () => {
    const serviceForOwner = createSkillServiceForOwner(() =>
      createMemorySkillStore(),
    );
    const service = serviceForOwner?.("owner-1");
    expect(service).toBeDefined();
    await expect(service?.list()).resolves.toContainEqual({
      description:
        "Use when a user requests a report, a real PDF file, or a PDF version of a saved report.",
      name: "pdf-report",
      namespace: "documents",
      readOnly: true,
      source: "global",
    });
    await expect(
      service?.resolve({ name: "pdf-report" }),
    ).resolves.toMatchObject({
      readOnly: true,
      source: "global",
      body: expect.stringContaining("typst compile"),
    });
  });

  it("distinguishes native Typst from Markdown and uses queried values verbatim", async () => {
    const service = createSkillServiceForOwner(() =>
      createMemorySkillStore(),
    )?.("owner-1");
    const skill = await service?.resolve({ name: "pdf-report" });

    expect(skill?.body).toContain(
      "For Typst output, use native Typst syntax, not Markdown.",
    );
    expect(skill?.body).toContain('image("charts/chart.png", width: 85%)');
    expect(skill?.body).toContain(
      "When a user requests live Trino data, query it first with the available Trino tools.",
    );
    expect(skill?.body).toContain(
      "Include the returned column names and row values verbatim",
    );
  });

  it("reuses complete chart preview rows when building a report chart", async () => {
    const service = createSkillServiceForOwner(() =>
      createMemorySkillStore(),
    )?.("owner-1");
    const skill = await service?.resolve({ name: "pdf-report" });

    expect(skill?.body).toContain(
      "reuse its output_schema, rows, and visualization_definition",
    );
    expect(skill?.body).toContain(
      "output_schema, rows, and visualization_definition",
    );
    expect(skill?.body).toContain("row_count equals rows.length");
    expect(skill?.body).toContain("rerun the matching data query with Trino");
    expect(skill?.body).toContain("create_document text document");
    expect(skill?.body).toContain("do not satisfy the request");
    expect(skill?.body).toContain(
      "Render the report in the sandbox and publish the actual PDF file",
    );
    expect(skill?.body).toContain("using its workspace path");
  });

  it("turns a saved Markdown report into a real PDF when requested", async () => {
    const service = createSkillServiceForOwner(() =>
      createMemorySkillStore(),
    )?.("owner-1");
    const skill = await service?.resolve({ name: "pdf-report" });

    expect(skill?.body).toContain(
      "When the user asks for a PDF after a Markdown report was saved",
    );
    expect(skill?.body).toContain(
      "retrieve the saved report with list_documents and get_document_text",
    );
    expect(skill?.body).toContain(
      "publish the generated PDF with create_document using its workspace path",
    );
    expect(skill?.body).toContain(
      "Do not offer Markdown conversion instructions instead of creating the PDF",
    );
  });
});
