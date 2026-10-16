import type { ManifestLoader } from "@application/agent";

export function createManifestLookup(
  manifestLoader: ManifestLoader | undefined,
) {
  if (manifestLoader === undefined) return undefined;
  return {
    async get({
      owner,
      name,
      manifestOwner,
    }: {
      owner: string;
      name: string;
      manifestOwner?: string;
    }) {
      const loaded = await manifestLoader.get({
        owner: manifestOwner ?? owner,
        name,
      });
      return loaded === undefined
        ? undefined
        : {
            owner,
            manifestHash: loaded.contentHash,
            manifestSourcePath: loaded.sourcePath,
            manifestYaml: loaded.yaml,
            governance: loaded.manifest.governance,
            systemPrompt: loaded.prompt,
            model: loaded.manifest.model,
            tools: loaded.manifest.tools,
            execution: loaded.manifest.execution,
            workingDirectory: loaded.manifest.workingDirectory,
            clientTools: loaded.manifest.clientTools,
            skills: loaded.manifest.skills,
          };
    },
  };
}
