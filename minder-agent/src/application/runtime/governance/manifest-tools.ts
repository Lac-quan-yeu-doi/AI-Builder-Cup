import {
  ToolRegistryView,
  type ToolRegistryPort,
} from "@application/shared/ports/index.js";

export interface RuntimeManifestToolPolicy {
  readonly mode: "allowlist" | "denylist" | "all";
  readonly names: readonly string[];
}

/** Select a per-run tool view while preserving the shared registry. */
export function applyManifestToolPolicy(
  registry: ToolRegistryPort,
  policy: RuntimeManifestToolPolicy | undefined,
): ToolRegistryPort {
  if (policy === undefined || policy.mode === "all")
    return new ToolRegistryView(registry, registry.all());
  const selected = new Set(policy.names);
  const matches = (name: string, aliases: readonly string[] = []): boolean =>
    selected.has(name) || aliases.some((alias) => selected.has(alias));
  return new ToolRegistryView(
    registry,
    registry
      .all()
      .filter((tool) =>
        policy.mode === "allowlist"
          ? matches(tool.name, tool.aliases)
          : !matches(tool.name, tool.aliases),
      ),
  );
}
