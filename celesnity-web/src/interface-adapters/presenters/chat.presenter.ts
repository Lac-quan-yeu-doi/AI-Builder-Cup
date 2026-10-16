import type { SendMessageResult } from '@/src/entities/models/chat';

export interface SendMessageResultViewModel {
  readonly runId: string;
  readonly roomId: string;
  readonly roomEventsUrl: string;
  readonly queuePosition: number;
}

export function presentSendMessageResult(result: SendMessageResult): SendMessageResultViewModel {
  return {
    runId: result.runId,
    roomId: result.roomId,
    roomEventsUrl: result.roomEventsUrl,
    queuePosition: result.queuePosition,
  };
}
