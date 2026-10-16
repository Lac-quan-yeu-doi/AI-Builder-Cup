import { describe, expect, it } from 'vitest';

import {
  defaultClientToolExecutors,
  executeClientTool,
} from '@/app/_components/chat/client-tool-executor';
import type { ClientToolCallRequest } from '@/src/entities/models/chat';

function call(name: string, args: Record<string, unknown>): ClientToolCallRequest {
  return { id: 'call-1', name, arguments: args };
}

describe('executeClientTool', () => {
  it('navigates to a chart when chart_id is present', () => {
    const result = executeClientTool(call('NavigateToChart', { chart_id: 'abc-123' }));
    expect(result).toEqual({ success: true, output: 'Navigated to chart abc-123' });
  });

  it('fails when NavigateToChart is missing chart_id', () => {
    const result = executeClientTool(call('NavigateToChart', {}));
    expect(result.success).toBe(false);
    expect(result.output).toContain('chart_id');
  });

  it('fails gracefully for a tool with no registered handler', () => {
    const result = executeClientTool(call('DoesNotExist', {}));
    expect(result.success).toBe(false);
    expect(result.output).toContain('DoesNotExist');
  });

  it('uses a caller-supplied executor map instead of the default', () => {
    const custom = {
      Ping: () => ({ success: true, output: 'pong' }),
    };
    const result = executeClientTool(call('Ping', {}), custom);
    expect(result).toEqual({ success: true, output: 'pong' });
  });

  it('exposes NavigateToChart on the default executor map', () => {
    expect(Object.keys(defaultClientToolExecutors)).toContain('NavigateToChart');
  });
});
