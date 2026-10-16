import type {
  RoomMetrics,
  RunFileContent,
  RunFileEntry,
  RunManifest,
  RunReport,
  RunTraceSpan,
  RunValidation,
  ChatApproval,
  ChatApprovalDecision,
  ChatApprovalDecisionResult,
  ChatHistoryRun,
  ChatSessionState,
  ChatSessionSummary,
  ChatTranscriptMessage,
  SendMessageInput,
  SendMessageResult,
} from '@/src/entities/models/chat';
import type { GovernanceEvidencePage, RunGovernance } from '@/src/entities/models/governance';

export interface ChatRepository {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  closeRunRegistration?(roomId: string, runId: string): Promise<void>;
  listSessions(userId: string): Promise<readonly ChatSessionSummary[]>;
  /**
   * `signal` reaches the underlying request. Without it a room's stream stays
   * open for the life of the page: aborting only ends the read loop, and the
   * connection itself is what a browser counts against its six-per-host limit.
   */
  streamEvents(
    userId: string,
    roomId: string,
    from?: string,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
  streamRunEvents(
    userId: string,
    runId: string,
    from?: string,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
  /** `roomId` is the room's server-assigned id, not its `key`. */
  getSessionTranscript(
    userId: string,
    roomId: string,
    agentName?: string,
  ): Promise<readonly ChatTranscriptMessage[]>;
  /** Recovers both the durable transcript and an outstanding agent question. */
  getSessionState(userId: string, roomId: string, agentName?: string): Promise<ChatSessionState>;
  getRoomHistory?(userId: string, roomId: string): Promise<readonly ChatHistoryRun[]>;
  resetConversation(userId: string, roomId: string, agentName: string): Promise<void>;
  /**
   * Same read, given the session's own id directly (off a run's manifest) —
   * for runs with no room at all, e.g. an automation-dispatched run.
   */
  getSessionTranscriptById(
    userId: string,
    sessionId: string,
  ): Promise<readonly ChatTranscriptMessage[]>;
  checkHealth(): Promise<boolean>;
  getRunManifest(userId: string, runId: string): Promise<RunManifest>;
  getRunTrace(userId: string, runId: string): Promise<readonly RunTraceSpan[]>;
  getRunReport(userId: string, runId: string): Promise<RunReport>;
  getRunValidation(userId: string, runId: string): Promise<RunValidation>;
  getRoomMetrics(userId: string, roomId: string): Promise<RoomMetrics>;
  listRunFiles(userId: string, runId: string): Promise<readonly RunFileEntry[]>;
  getRunFileContent(userId: string, runId: string, path: string): Promise<RunFileContent>;
  listRunApprovals(userId: string, runId: string): Promise<readonly ChatApproval[]>;
  decideRunApproval(
    userId: string,
    runId: string,
    approvalId: string,
    decision: ChatApprovalDecision,
  ): Promise<ChatApprovalDecisionResult>;
  getRunGovernance?(userId: string, runId: string): Promise<RunGovernance>;
  getRunGovernanceEvidence?(
    userId: string,
    runId: string,
    cursor?: string,
  ): Promise<GovernanceEvidencePage>;
}
