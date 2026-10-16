import type { ManifestLoader } from "./manifest-loader.js";

/** Initialize each authenticated organization, not a deployment's bootstrap tenant. */
export function createMigratingManifestLoader(
  loader: ManifestLoader,
  initialize: (owner: string) => Promise<void>,
): ManifestLoader {
  const ready = new Map<string, Promise<void>>();
  const ensure = (owner: string): Promise<void> => {
    let pending = ready.get(owner);
    if (pending === undefined) {
      pending = initialize(owner).catch((error: unknown) => {
        ready.delete(owner);
        throw error;
      });
      ready.set(owner, pending);
    }
    return pending;
  };
  return {
    ...loader,
    async get(input) {
      await ensure(input.owner);
      return loader.get(input);
    },
    async list(owner) {
      await ensure(owner);
      return loader.list(owner);
    },
    async save(input) {
      await ensure(input.owner);
      return loader.save(input);
    },
    async remove(input) {
      await ensure(input.owner);
      return loader.remove(input);
    },
  };
}
