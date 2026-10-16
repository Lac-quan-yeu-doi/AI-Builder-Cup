import type { IWatchSourcePollingAdapter } from '@application/data-workflow-watch-source/interfaces/i-watch-source-polling-adapter';

export interface IWatchSourcePollingAdapterRegistry {
  require(adapterKey: string): IWatchSourcePollingAdapter;
}
