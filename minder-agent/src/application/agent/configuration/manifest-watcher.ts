import type {
  LoadedAgentManifest,
  ManifestChange,
  ManifestWatchOptions,
} from "./manifest-loader.js";

export function createManifestWatcher(
  owner: string,
  load: () => Promise<readonly LoadedAgentManifest[]>,
  onChange: (change: ManifestChange) => void,
  options: ManifestWatchOptions = {},
): () => void {
  const intervalMs = Math.max(50, options.intervalMs ?? 1_000);
  let stopped = false;
  let initialized = false;
  let previous = new Map<string, string>();
  let lastInvalidMessage: string | undefined;

  const poll = async () => {
    if (stopped) return;
    try {
      const entries = await load();
      const current = new Map(
        entries.map((entry) => [entry.name, entry.contentHash]),
      );
      if (initialized) {
        for (const [name, contentHash] of current) {
          if (previous.get(name) !== contentHash)
            onChange({ owner, name, contentHash, status: "loaded" });
        }
        for (const name of previous.keys()) {
          if (!current.has(name)) onChange({ owner, name, status: "removed" });
        }
      }
      previous = current;
      initialized = true;
      lastInvalidMessage = undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastInvalidMessage) {
        lastInvalidMessage = message;
        for (const name of previous.keys())
          onChange({ owner, name, status: "invalid" });
      }
    }
  };

  void poll();
  const timer = setInterval(() => void poll(), intervalMs);
  if (typeof timer === "object" && timer !== null && "unref" in timer)
    (timer as { unref: () => void }).unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
