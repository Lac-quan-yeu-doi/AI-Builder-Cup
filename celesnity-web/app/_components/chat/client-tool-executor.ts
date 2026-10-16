import type { ClientToolCallRequest } from '@/src/entities/models/chat';

export interface ClientToolExecutionResult {
  readonly success: boolean;
  readonly output: string;
}

export type ClientToolExecutor = (
  args: Readonly<Record<string, unknown>>,
) => ClientToolExecutionResult;

/**
 * Built-in client tools this workspace knows how to execute. A manifest can
 * declare a `client_tools` entry with any name; one without a matching
 * executor here fails gracefully (see {@link executeClientTool}) rather than
 * silently hanging the run.
 */
export const defaultClientToolExecutors: Readonly<Record<string, ClientToolExecutor>> = {
  NavigateToChart: (args) => {
    const chartId = args['chart_id'];
    if (typeof chartId !== 'string' || !chartId) {
      return { success: false, output: 'chart_id is required' };
    }
    return { success: true, output: `Navigated to chart ${chartId}` };
  },
};

/**
 * Runs a paused client tool call and formats its result as plain text — fed
 * back to the agent as the next turn's message (see `chat-screen.tsx`'s
 * `onClientToolCall` handler), mirroring how an `AskUser` answer is just the
 * next turn's `input`.
 */
export function executeClientTool(
  call: ClientToolCallRequest,
  executors: Readonly<Record<string, ClientToolExecutor>> = defaultClientToolExecutors,
): ClientToolExecutionResult {
  const executor = executors[call.name];
  if (!executor) {
    return { success: false, output: `No client-side handler is registered for "${call.name}".` };
  }
  return executor(call.arguments);
}
