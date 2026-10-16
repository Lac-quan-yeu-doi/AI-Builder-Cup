import { describe, expect, it } from "vitest";

import {
  TOOL_CATALOG,
  configuredToolPorts,
  implementedCatalogNames,
} from "@infrastructure/tools/impl";

describe("feature availability ledger", () => {
  it("marks a local tool implemented only when a ToolPort is composed", () => {
    expect(implementedCatalogNames()).toEqual(
      configuredToolPorts()
        .map((tool) => tool.descriptor.name)
        .sort(),
    );
  });

  it("keeps every descriptor without a configured port contract_only or prompt_only", () => {
    const implemented = new Set(implementedCatalogNames());
    for (const descriptor of TOOL_CATALOG) {
      if (implemented.has(descriptor.name)) {
        expect(descriptor.state).toBe("implemented");
      } else {
        expect(["contract_only", "prompt_only"]).toContain(descriptor.state);
      }
    }
  });

  it("never advertises a prompt-only descriptor as an executable port", () => {
    const configuredNames = new Set(
      configuredToolPorts().map((tool) => tool.descriptor.name),
    );
    for (const descriptor of TOOL_CATALOG) {
      if (descriptor.kind === "prompt_only") {
        expect(configuredNames.has(descriptor.name)).toBe(false);
      }
    }
  });
});
