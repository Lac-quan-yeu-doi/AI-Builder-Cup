export type MessageBlockStreamState = 'connected' | 'reconnecting' | 'paused' | 'failed';
export type MessageBlockCloseReason =
  'unmount' | 'room_change' | 'replacement' | 'manual_reconnect';
export type MessageBlockRecoveryReason = 'transport_failure' | 'cursor_reset';
export interface MessageBlockRecoveryResult {
  readonly cursor?: string;
  readonly resume: boolean;
}
export interface MessageBlockStreamLifecycle {
  onStateChange?(state: MessageBlockStreamState): void;
  /** A durable run or a pending approval/input must keep receiving projections. */
  shouldReconnect?(): boolean;
  /** Reload authoritative state/history without creating or cancelling a turn. */
  recover?(
    reason: MessageBlockRecoveryReason,
    cursor?: string,
  ): Promise<MessageBlockRecoveryResult>;
}
