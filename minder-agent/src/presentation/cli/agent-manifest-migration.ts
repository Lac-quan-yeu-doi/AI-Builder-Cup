import { createHash } from "node:crypto";
import { parse } from "yaml";
import { organizationScopeKey } from "@domain/index.js";

const CUTOVER_MARKER = ".minder-agent-manifest-cutover.json";
const MIGRATION_REPORT = ".minder-agent-manifest-migration-report.json";

export interface AgentManifestInventoryMember {
  readonly organization_id: string;
  readonly identity_tenant_id: string;
  readonly subject: string;
  readonly legacy_owner: string;
}

export interface AgentManifestInventory {
  readonly version: 1;
  readonly generated_at: string;
  readonly members: readonly AgentManifestInventoryMember[];
}

export interface ManifestMigrationWorkspace {
  list(owner: string, prefix: string): Promise<readonly string[]>;
  read(owner: string, path: string): Promise<string | undefined>;
  write(owner: string, path: string, content: string): Promise<void>;
}

export type ManifestMigrationAction =
  "copied" | "deduplicated" | "conflict" | "missing" | "verified";

export interface ManifestMigrationEntry {
  readonly organizationId: string;
  readonly manifestName: string;
  readonly sourceLegacyOwners: readonly string[];
  readonly action: ManifestMigrationAction;
  readonly sourceDigest?: string;
  readonly targetDigest?: string;
}

export interface ManifestMigrationReport {
  readonly generatedAt: string;
  readonly cutoverReady: boolean;
  readonly entries: readonly ManifestMigrationEntry[];
}

export interface AgentManifestMigration {
  migrate(input: {
    readonly inventory: AgentManifestInventory;
    readonly mode: "dry-run" | "apply";
    readonly organizationId?: string;
  }): Promise<ManifestMigrationReport>;
  verify(input: {
    readonly inventory: AgentManifestInventory;
    readonly organizationId?: string;
  }): Promise<ManifestMigrationReport>;
}

interface Closure {
  readonly digest: string;
  readonly files: ReadonlyMap<string, string>;
}

interface SourceManifest {
  readonly owner: string;
  readonly name: string;
  readonly closure?: Closure;
}

export function createAgentManifestMigration(input: {
  readonly workspace: ManifestMigrationWorkspace;
  readonly now?: () => string;
}): AgentManifestMigration {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    async migrate({ inventory, mode, organizationId }) {
      return runMigration({
        inventory,
        mode,
        ...(organizationId === undefined ? {} : { organizationId }),
        writeMarker: mode === "apply",
      });
    },
    async verify({ inventory, organizationId }) {
      return runMigration({
        inventory,
        mode: "verify",
        ...(organizationId === undefined ? {} : { organizationId }),
        writeMarker: false,
      });
    },
  };

  async function runMigration(options: {
    readonly inventory: AgentManifestInventory;
    readonly mode: "dry-run" | "apply" | "verify";
    readonly organizationId?: string;
    readonly writeMarker: boolean;
  }): Promise<ManifestMigrationReport> {
    validateInventory(options.inventory);
    const groups = groupMembers(
      options.inventory.members,
      options.organizationId,
    );
    const entries: ManifestMigrationEntry[] = [];
    for (const [organizationId, members] of groups) {
      const manifestOwner = organizationScopeKey({
        identityTenantId: members[0]!.identity_tenant_id,
        organizationId,
      });
      const sources = await readSourceManifests(members);
      const names = new Set(sources.map((source) => source.name));
      for (const name of names) {
        const candidates = sources.filter((source) => source.name === name);
        const sourceOwners = [
          ...new Set(candidates.map((source) => source.owner)),
        ].sort();
        if (candidates.some((source) => source.closure === undefined)) {
          entries.push({
            organizationId,
            manifestName: name,
            sourceLegacyOwners: sourceOwners,
            action: "missing",
          });
          continue;
        }
        const digests = [
          ...new Set(candidates.map((source) => source.closure!.digest)),
        ].sort();
        if (digests.length > 1) {
          entries.push({
            organizationId,
            manifestName: name,
            sourceLegacyOwners: sourceOwners,
            action: "conflict",
            sourceDigest: digests.join(","),
          });
          continue;
        }

        const source = candidates[0]!;
        const sourceClosure = source.closure!;
        const target = await readTargetManifest(manifestOwner, name);
        if (target === "missing") {
          if (options.mode === "apply") {
            for (const [path, content] of sourceClosure.files)
              await input.workspace.write(manifestOwner, path, content);
          }
          entries.push({
            organizationId,
            manifestName: name,
            sourceLegacyOwners: sourceOwners,
            action: options.mode === "verify" ? "missing" : "copied",
            sourceDigest: sourceClosure.digest,
          });
          continue;
        }
        if (target === "invalid") {
          entries.push({
            organizationId,
            manifestName: name,
            sourceLegacyOwners: sourceOwners,
            action: "conflict",
            sourceDigest: sourceClosure.digest,
          });
          continue;
        }
        if (target.digest !== sourceClosure.digest) {
          entries.push({
            organizationId,
            manifestName: name,
            sourceLegacyOwners: sourceOwners,
            action: "conflict",
            sourceDigest: sourceClosure.digest,
            targetDigest: target.digest,
          });
          continue;
        }
        entries.push({
          organizationId,
          manifestName: name,
          sourceLegacyOwners: sourceOwners,
          action: options.mode === "verify" ? "verified" : "deduplicated",
          sourceDigest: sourceClosure.digest,
          targetDigest: target.digest,
        });
      }

      const organizationEntries = entries.filter(
        (entry) => entry.organizationId === organizationId,
      );
      const organizationReady = organizationEntries.every(
        (entry) =>
          entry.action === "copied" ||
          entry.action === "deduplicated" ||
          entry.action === "verified",
      );
      if (options.mode === "apply") {
        const report = {
          generatedAt: now(),
          cutoverReady: organizationReady,
          entries: organizationEntries,
        } satisfies ManifestMigrationReport;
        await input.workspace.write(
          manifestOwner,
          MIGRATION_REPORT,
          JSON.stringify(report, null, 2),
        );
        if (options.writeMarker && organizationReady) {
          await input.workspace.write(
            manifestOwner,
            CUTOVER_MARKER,
            JSON.stringify({ generatedAt: now(), organizationId }, null, 2),
          );
        }
      }
    }
    const cutoverReady = entries.every(
      (entry) =>
        entry.action === "copied" ||
        entry.action === "deduplicated" ||
        entry.action === "verified",
    );
    return { generatedAt: now(), cutoverReady, entries };
  }

  async function readSourceManifests(
    members: readonly AgentManifestInventoryMember[],
  ): Promise<readonly SourceManifest[]> {
    const sources: SourceManifest[] = [];
    for (const member of members) {
      const paths = (await input.workspace.list(member.legacy_owner, "agents/"))
        .filter((path) => /^agents\/[^/]+\.ya?ml$/u.test(path))
        .sort();
      for (const path of paths) {
        const yaml = await input.workspace.read(member.legacy_owner, path);
        if (yaml === undefined) continue;
        let name: string;
        try {
          name = manifestName(path, yaml);
        } catch {
          name = path.slice("agents/".length).replace(/\.ya?ml$/u, "");
        }
        try {
          sources.push({
            owner: member.legacy_owner,
            name,
            closure: await readClosure(member.legacy_owner, path, yaml),
          });
        } catch {
          sources.push({ owner: member.legacy_owner, name });
        }
      }
    }
    return sources;
  }

  async function readTargetManifest(
    owner: string,
    name: string,
  ): Promise<Closure | "missing" | "invalid"> {
    for (const path of [`agents/${name}.yaml`, `agents/${name}.yml`]) {
      const yaml = await input.workspace.read(owner, path);
      if (yaml === undefined) continue;
      try {
        return await readClosure(owner, path, yaml);
      } catch {
        return "invalid";
      }
    }
    return "missing";
  }

  async function readClosure(
    owner: string,
    manifestPath: string,
    yaml: string,
  ): Promise<Closure> {
    const files = new Map<string, string>([[manifestPath, yaml]]);
    const document = parse(yaml) as {
      readonly system_prompt?: { readonly file?: unknown };
    } | null;
    const promptPath = document?.system_prompt?.file;
    if (promptPath !== undefined) {
      if (typeof promptPath !== "string")
        throw new Error(`Prompt asset path is invalid for ${manifestPath}.`);
      const normalized = safeAssetPath(promptPath);
      const prompt = await input.workspace.read(owner, normalized);
      if (prompt === undefined)
        throw new Error(`Prompt asset is missing: ${normalized}.`);
      files.set(normalized, prompt);
    }
    const digest = createHash("sha256")
      .update(
        [...files.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([path, content]) => `${path}\0${content}`)
          .join("\0"),
      )
      .digest("hex");
    return { digest, files };
  }
}

function validateInventory(inventory: AgentManifestInventory): void {
  if (inventory.version !== 1)
    throw new Error("Unsupported manifest inventory version.");
  if (!inventory.generated_at.trim())
    throw new Error("Inventory generated_at is required.");
  for (const member of inventory.members) {
    for (const [name, value] of Object.entries(member)) {
      if (typeof value !== "string" || value.trim() === "")
        throw new Error(`Inventory member ${name} is required.`);
    }
  }
}

function groupMembers(
  members: readonly AgentManifestInventoryMember[],
  organizationId?: string,
): ReadonlyMap<string, readonly AgentManifestInventoryMember[]> {
  const grouped = new Map<string, AgentManifestInventoryMember[]>();
  for (const member of members) {
    if (
      organizationId !== undefined &&
      member.organization_id !== organizationId
    )
      continue;
    const current = grouped.get(member.organization_id) ?? [];
    current.push(member);
    grouped.set(member.organization_id, current);
  }
  return new Map(
    [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function manifestName(path: string, yaml: string): string {
  const parsed = parse(yaml) as { readonly name?: unknown } | null;
  if (typeof parsed?.name === "string" && parsed.name.trim())
    return parsed.name.trim();
  const match = /^agents\/([^/]+)\.ya?ml$/u.exec(path);
  if (!match?.[1]) throw new Error(`Manifest name is missing: ${path}.`);
  return match[1];
}

function safeAssetPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === ".." || part === "")
  )
    throw new Error(
      "Prompt asset path must remain within the manifest workspace.",
    );
  return normalized;
}
