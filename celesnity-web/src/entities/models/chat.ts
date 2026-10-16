export interface SendMessageInput {
  readonly userId: string;
  /** The room to send into, or `null` to create one on first send. */
  readonly roomId: string | null;
  readonly message: string;
  /**
   * Client-generated per-session identifier, used as the new room's `key`
   * when `roomId` is `null`. `key` is unique per `(X-Caller-Id, key)` on the
   * server — reusing `userId` here would collide with every other session
   * for the same user (see `AgentApiChatRepository.createRoom`).
   */
  readonly sessionKey: string;
  /**
   * Overrides which registered agent this room's runs use, instead of the
   * general chat agent (`publicEnvironment.chatAgentName`). Existing rooms
   * reconcile this member before their first recovered send.
   */
  readonly agent?: string;
  /** Workflow-editor context passed through to the selected Agent. */
  readonly context?: {
    readonly kind: 'automation-workflow';
    readonly workflowId: string;
    readonly workflowName: string;
  };
  /**
   * The selected database is registered with Core for each run. `undefined`
   * explicitly registers all databases, still bounded by human/Agent grants.
   */
  readonly dataScope?: { readonly catalog?: string; readonly schema: string };
  /** Typed Plant Model binding consumed only by server-side tools. */
  readonly plantModelScope?: PlantModelToolScope;
  /**
   * Only used when `roomId` is `null` (a new room is being created) — becomes
   * the room's `name` server-side, so `listSessions` can later show a real
   * per-conversation title instead of a generic fallback. Ignored once the
   * room already exists; a room's name is set once, at creation.
   */
  readonly title?: string;
}

export interface PlantModelToolScope {
  readonly plantSiteId: string;
  readonly draftRevision?: number;
  readonly selectedNodeId?: string;
  readonly selectedRelationshipId?: string;
  readonly selectedDashboardId?: string;
}

export interface SendMessageResult {
  readonly runId: string;
  readonly roomId: string;
  readonly roomEventsUrl: string;
  readonly queuePosition: number;
}

export interface ChatHistoryEvent {
  readonly seq: number;
  readonly payload: { readonly type: string; readonly data?: unknown };
}

export interface ChatHistoryRun {
  readonly runId: string;
  readonly sessionId: string;
  readonly input: string;
  readonly status: string;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly responseText: string;
  readonly events: readonly ChatHistoryEvent[];
}

/** A durable user/assistant message read back from an agent session. */
export interface ChatTranscriptMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly reasoning: string | null;
}

/** Durable conversation state recovered when reopening a room. */
export interface ChatSessionState {
  readonly transcript: readonly ChatTranscriptMessage[];
  readonly pendingQuestion: ChatAskUserRequest | null;
  readonly pendingApproval?: ChatPendingApproval | null;
}

/**
 * One of the caller's past conversations, as minder-agent knows it — enough
 * to seed a `ChatSession` shell in the sidebar. `id` is the room's `key`
 * (the id celesnity-web generated client-side when it created the room —
 * see `AgentApiChatRepository.createRoom`); `roomId` is the room's own
 * server-assigned id, which is what `getSessionTranscript` actually needs
 * (it is *not* the same string as `key` — see that method's doc). Messages
 * are not included here — the existing per-session transcript hydration
 * (`getSessionTranscript`) fills them in lazily once a conversation is
 * actually opened, since a transcript can be large.
 */
export interface ChatSessionSummary {
  readonly id: string;
  readonly roomId: string;
  readonly title: string;
  /** The sole agent selected when this workspace conversation was created. */
  readonly agentName?: string;
}

export interface ChatQuestionOption {
  readonly label: string;
  readonly description: string | null;
}

/** A question the agent paused on, mid-run (`AgentEvent::AwaitingInput`). */
export interface ChatAskUserRequest {
  readonly question: string;
  readonly options: readonly ChatQuestionOption[];
  readonly allowOther: boolean;
}

export type ChatApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

/** A runtime approval request surfaced while an agent tool call is paused. */
export interface ChatPendingApproval {
  readonly runId?: string;
  readonly approvalId: string;
  readonly action: string;
  readonly preview: string;
  readonly expiresAt: string;
}

/** Durable approval record returned by minder-agent's approval API. */
export interface ChatApproval {
  readonly id: string;
  readonly toolCallId: string;
  readonly action: string;
  readonly argumentsHash: string;
  readonly preview: string;
  readonly status: ChatApprovalStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly decidedAt: string | null;
}

export interface ChatApprovalDecisionResult extends ChatApproval {
  readonly continuationRunId: string | null;
}

export type ChatApprovalDecision = 'approved' | 'denied';

/**
 * A frontend-executed tool call the agent paused on, mid-run
 * (`AgentEvent::ClientToolCall`) — e.g. "navigate to this chart". Declared
 * per-agent in the manifest's `client_tools`, distinct from server-side
 * tools the agent dispatches itself.
 */
export interface ClientToolCallRequest {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/**
 * A named, agent-written session variable (AIP's application-state
 * pattern), set via the `SetApplicationState` tool. Surfaced live from the
 * tool's own `tool_started` args on the room stream — there is no separate
 * fetch, so a page reload does not recover state set before the reload.
 */
export interface ApplicationStateUpdate {
  readonly name: string;
  readonly value: unknown;
  readonly visible: boolean;
}

export interface TokenUsageDelta {
  readonly input: number;
  readonly output: number;
}

export interface RunManifest {
  readonly manifestVersion: number;
  readonly manifestId: string;
  readonly runId: string;
  readonly sessionId: string | null;
  readonly parentRunId: string | null;
  readonly rootRunId: string;
  readonly agent: Record<string, unknown>;
  readonly model: Record<string, unknown>;
  readonly instructions: Record<string, unknown>;
  readonly skills: readonly Record<string, unknown>[];
  readonly tools: Record<string, unknown>;
  readonly runtime: Record<string, unknown>;
  readonly environment: Record<string, unknown>;
  readonly input: Record<string, unknown>;
}

export interface RunTraceError {
  readonly category: string;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly source: string;
}

export interface RunTraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly runId: string;
  readonly rootRunId: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly attributes: Record<string, unknown>;
  readonly error: RunTraceError | null;
}

export interface RunReport {
  readonly runId: string;
  readonly markdown: string;
}

export interface RunFileEntry {
  readonly path: string;
  readonly accessType: 'read' | 'created' | 'modified';
  readonly toolName: string;
  readonly accessedAt: string;
  readonly available: boolean;
  readonly sizeBytes?: number;
  readonly mimeType?: string;
}

export interface RunFileContent {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly fileName: string;
}

export interface RunValidationError {
  readonly path: string;
  readonly message: string;
}

export interface RunValidation {
  readonly status: 'valid' | 'repaired' | 'invalid' | 'skipped';
  readonly contractId: string;
  readonly contractVersion: string;
  readonly attempts: number;
  readonly errors: readonly RunValidationError[];
  readonly outputHash: string;
  readonly validatedAt: string;
}

/**
 * Aggregate success/failure counts and duration percentiles across every
 * run a room has ever dispatched (minder-agent's `GET /rooms/:id/metrics`).
 * Scoped per room — a run carries no owner of its own, so an unscoped
 * aggregate would mix in every other caller's run volume and timing.
 */
export interface RoomMetrics {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly skipped: number;
  readonly running: number;
  readonly p50DurationMs: number | null;
  readonly p95DurationMs: number | null;
}
