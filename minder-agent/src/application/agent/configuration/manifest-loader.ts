import type { AgentManifest, ResolvedAgentManifest } from "./manifests.js";
import type { Sha256 } from "@application/shared/ports/index.js";
import {
  confinedWorkspacePath,
  manifestName,
  parseAgentManifest,
  substituteEnvironment,
} from "./manifest-parser.js";
import { createManifestWatcher } from "./manifest-watcher.js";

export interface ManifestWorkspace {
  list(owner: string, prefix: string): Promise<readonly string[]>;
  read(owner: string, path: string): Promise<string | undefined>;
  write(owner: string, path: string, content: string): Promise<void>;
  remove(owner: string, path: string): Promise<void>;
}

export interface LoadedAgentManifest {
  readonly contentHash: string;
  readonly manifest: ResolvedAgentManifest;
  readonly name: string;
  readonly prompt: string;
  readonly sourcePath: string;
  readonly yaml: string;
}

export type ManifestChangeStatus = "loaded" | "invalid" | "removed";

export interface ManifestChange {
  readonly owner: string;
  readonly name: string;
  readonly contentHash?: string;
  readonly status: ManifestChangeStatus;
}

export interface ManifestWatchOptions {
  readonly intervalMs?: number;
}

export interface ManifestLoader {
  get(input: {
    readonly owner: string;
    readonly name: string;
  }): Promise<LoadedAgentManifest | undefined>;
  list(owner: string): Promise<readonly LoadedAgentManifest[]>;
  save(input: {
    readonly owner: string;
    readonly name: string;
    readonly yaml: string;
  }): Promise<LoadedAgentManifest>;
  remove(input: {
    readonly owner: string;
    readonly name: string;
  }): Promise<void>;
  validate(input: {
    readonly owner: string;
    readonly yaml: string;
  }): Promise<LoadedAgentManifest>;
  watch(
    owner: string,
    onChange: (change: ManifestChange) => void,
    options?: ManifestWatchOptions,
  ): () => void;
}

export function createManifestLoader(input: {
  readonly workspace: ManifestWorkspace;
  readonly parseYaml: (source: string) => unknown;
  readonly sha256: Sha256;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}): ManifestLoader {
  const cache = new Map<
    string,
    {
      readonly signature: string;
      readonly entries: readonly LoadedAgentManifest[];
    }
  >();

  const readOwner = async (
    owner: string,
  ): Promise<readonly LoadedAgentManifest[]> => {
    const paths = (await input.workspace.list(owner, "agents/"))
      .filter((path) => /^agents\/[^/]+\.ya?ml$/u.test(path))
      .sort((left, right) => left.localeCompare(right));
    const sources = await Promise.all(
      paths.map(async (sourcePath) => {
        const source = await input.workspace.read(owner, sourcePath);
        if (source === undefined)
          throw new Error(`manifest file is missing: ${sourcePath}`);
        return { source, sourcePath };
      }),
    );
    const resolved = await Promise.all(
      sources.map(async ({ source, sourcePath }) => {
        const manifest = parseAgentManifest(
          substituteEnvironment(source, input.environment ?? {}),
          sourcePath,
          input.parseYaml,
        );
        const prompt = await resolvePrompt(input.workspace, owner, manifest);
        return { manifest, prompt, source, sourcePath };
      }),
    );
    const sourceSignature = input.sha256(
      resolved
        .map(
          ({ prompt, source, sourcePath }) =>
            `${sourcePath}\0${source}\0${prompt}`,
        )
        .join("\0"),
    );
    const cached = cache.get(owner);
    if (cached?.signature === sourceSignature) return cached.entries;

    const loaded = resolved.map(({ manifest, prompt, source, sourcePath }) => ({
      contentHash: input.sha256(source),
      manifest,
      name: manifest.name,
      prompt,
      sourcePath,
      yaml: source,
    }));
    const names = new Set<string>();
    for (const entry of loaded) {
      if (names.has(entry.name))
        throw new Error(`duplicate agent manifest name: ${entry.name}`);
      names.add(entry.name);
    }
    cache.set(owner, { signature: sourceSignature, entries: loaded });
    return loaded;
  };

  const load = async (
    owner: string,
  ): Promise<readonly LoadedAgentManifest[]> => {
    try {
      return await readOwner(owner);
    } catch (error) {
      const cached = cache.get(owner);
      if (cached) return cached.entries;
      throw error;
    }
  };

  return {
    async get({ owner, name }) {
      if (!owner.trim()) throw new Error("manifest owner is required");
      if (!name.trim()) throw new Error("manifest name is required");
      return (await load(owner)).find((entry) => entry.name === name);
    },
    list(owner) {
      if (!owner.trim())
        return Promise.reject(new Error("manifest owner is required"));
      return load(owner);
    },
    async save({ owner, name, yaml }) {
      if (!owner.trim()) throw new Error("manifest owner is required");
      const normalizedName = manifestName(name);
      const sourcePath = `agents/${normalizedName}.yaml`;
      const manifest = parseAgentManifest(
        substituteEnvironment(yaml, input.environment ?? {}),
        sourcePath,
        input.parseYaml,
      );
      if (manifest.name !== normalizedName)
        throw new Error("manifest name must match its file name");
      await input.workspace.write(owner, sourcePath, yaml);
      cache.delete(owner);
      const result = (await load(owner)).find(
        (entry) => entry.name === normalizedName,
      );
      if (!result) throw new Error("saved manifest could not be loaded");
      return result;
    },
    async remove({ owner, name }) {
      if (!owner.trim()) throw new Error("manifest owner is required");
      await input.workspace.remove(owner, `agents/${manifestName(name)}.yaml`);
      cache.delete(owner);
    },
    async validate({ owner, yaml }) {
      if (!owner.trim()) throw new Error("manifest owner is required");
      const sourcePath = "agents/validation.yaml";
      const manifest = parseAgentManifest(
        substituteEnvironment(yaml, input.environment ?? {}),
        sourcePath,
        input.parseYaml,
      );
      return {
        contentHash: input.sha256(yaml),
        manifest,
        name: manifest.name,
        prompt: await resolvePrompt(input.workspace, owner, manifest),
        sourcePath,
        yaml,
      };
    },
    watch(owner, onChange, options = {}) {
      if (!owner.trim()) throw new Error("manifest owner is required");
      return createManifestWatcher(
        owner,
        () => readOwner(owner),
        onChange,
        options,
      );
    },
  };
}

async function resolvePrompt(
  workspace: ManifestWorkspace,
  owner: string,
  manifest: AgentManifest,
): Promise<string> {
  if (manifest.systemPrompt.kind === "inline")
    return manifest.systemPrompt.value;
  const path = confinedWorkspacePath(manifest.systemPrompt.value);
  const prompt = await workspace.read(owner, path);
  if (prompt === undefined)
    throw new Error(`manifest prompt file is missing: ${path}`);
  return prompt;
}
