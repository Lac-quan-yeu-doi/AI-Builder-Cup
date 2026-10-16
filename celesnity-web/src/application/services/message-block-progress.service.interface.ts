import type {
  MessageBlockStreamLifecycle,
  MessageBlockCloseReason,
} from '@/src/entities/models/message-block-stream';
import type { MessageBlock } from '@/src/entities/models/message-block';

export interface MessageBlockProgressObserver extends MessageBlockStreamLifecycle {
  onBlock(block: MessageBlock): void;
  onError(error: unknown): void;
}

export interface MessageBlockProgressSubscription {
  close(reason?: MessageBlockCloseReason): void;
}

export interface MessageBlockProgressService {
  subscribe(
    roomId: string,
    observer: MessageBlockProgressObserver,
    cursor?: string,
  ): MessageBlockProgressSubscription;
}
