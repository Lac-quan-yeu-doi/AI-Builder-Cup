import type { Response } from 'express';
import type { StreamCloseReason } from '@presentation/message-block/message-block-stream.admission';

export interface MessageBlockHttpOutcome {
  reason?: StreamCloseReason;
}

// Only the admitted response adapter registers a stream. Headers and paths cannot
// grant this classification. Weak keys do not retain completed responses.
const streams = new WeakMap<Response, MessageBlockHttpOutcome>();

export function registerMessageBlockHttpStream(response: Response): MessageBlockHttpOutcome {
  const outcome: MessageBlockHttpOutcome = {};
  streams.set(response, outcome);
  return outcome;
}

export function messageBlockHttpOutcome(response: Response): MessageBlockHttpOutcome | undefined {
  return streams.get(response);
}
