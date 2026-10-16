import type { QueryMonitorControllerHandlers } from '@/src/interface-adapters/controllers/queries/monitor-query.controller';

export type QueryDisplayChannel = 'sse' | 'polling';

type QueryMonitorChannel = Parameters<NonNullable<QueryMonitorControllerHandlers['onChannel']>>[0];

export function queryMonitorChannel(channel: QueryMonitorChannel): QueryDisplayChannel {
  return channel === 'streaming' ? 'sse' : 'polling';
}
