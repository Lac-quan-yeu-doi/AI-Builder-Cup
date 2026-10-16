import type { IWatchSourcePollingAdapter } from '@application/data-workflow-watch-source/interfaces/i-watch-source-polling-adapter';
import type { IWatchSourcePollingAdapterRegistry } from '@application/data-workflow-watch-source/interfaces/i-watch-source-polling-adapter-registry';
import { WatchSourcePollingError } from '@application/data-workflow-watch-source/watch-source-polling.errors';

export class WatchSourcePollingAdapterRegistry implements IWatchSourcePollingAdapterRegistry {
  private readonly adapters: ReadonlyMap<string, IWatchSourcePollingAdapter>;

  public constructor(adapters: readonly IWatchSourcePollingAdapter[]) {
    const entries = new Map<string, IWatchSourcePollingAdapter>();
    for (const adapter of adapters) {
      const key = adapter.adapterKey.trim().toUpperCase();
      if (key.length === 0 || entries.has(key)) {
        throw new Error('Watch Source polling adapter keys must be unique and non-empty.');
      }
      entries.set(key, adapter);
    }
    this.adapters = entries;
  }

  public require(adapterKey: string): IWatchSourcePollingAdapter {
    const adapter = this.adapters.get(adapterKey.trim().toUpperCase());
    if (adapter === undefined) throw new WatchSourcePollingError('SOURCE_QUERY_FAILED');
    return adapter;
  }
}
