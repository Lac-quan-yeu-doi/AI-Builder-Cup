import type { ChatRepository } from '@/src/application/repositories/chat.repository.interface';
import { publicEnvironment } from '@/src/infrastructure/configuration/public-environment';
import type {
  ChatSessionSummary,
  ChatSessionState,
  ChatAskUserRequest,
  ChatApproval,
  ChatApprovalDecision,
  ChatApprovalDecisionResult,
  ChatHistoryRun,
  ChatPendingApproval,
  ChatTranscriptMessage,
  RoomMetrics,
  RunFileContent,
  RunFileEntry,
  RunManifest,
  RunReport,
  RunTraceSpan,
  RunValidation,
  SendMessageInput,
  SendMessageResult,
} from '@/src/entities/models/chat';
import type { GovernanceEvidencePage, RunGovernance } from '@/src/entities/models/governance';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';
import { ConflictError } from '@/src/entities/errors/application-errors';

interface RoomDto {
  readonly id: string;
  readonly key?: string | null;
  readonly name?: string;
  readonly members?: readonly string[];
}

interface SessionDto {
  readonly id: string;
  readonly pending_question?: unknown;
  readonly pending_approval?: unknown;
}

interface SessionTranscriptDto {
  readonly history: readonly Record<string, unknown>[];
}

interface RoomHistoryDto {
  readonly room_id: string;
  readonly truncated: boolean;
  readonly runs: readonly {
    readonly run_id: string;
    readonly session_id: string;
    readonly input: string;
    readonly status: string;
    readonly created_at: string;
    readonly finished_at: string | null;
    readonly response_text: string;
    readonly events: readonly {
      readonly seq: number;
      readonly payload: { readonly type: string; readonly data?: unknown };
    }[];
  }[];
}

interface RoomRunStartedDto {
  readonly run_id: string;
  readonly room_id: string;
  readonly room_events_url: string;
  readonly queue_position: number;
}

interface HealthzDto {
  readonly status: string;
}

interface RunManifestDto {
  readonly run_id: string;
  readonly manifest?: unknown;
  readonly content_hash?: string;
  readonly manifest_name?: string;
  readonly source_path?: string;
  readonly yaml?: string;
  readonly created_at?: string;
  /** Legacy Rust reliability read model retained for mixed-version servers. */
  readonly manifest_version?: number;
  readonly manifest_id?: string;
  readonly session_id?: string | null;
  readonly parent_run_id?: string | null;
  readonly root_run_id?: string;
  readonly agent?: Record<string, unknown>;
  readonly model?: Record<string, unknown>;
  readonly instructions?: Record<string, unknown>;
  readonly skills?: readonly Record<string, unknown>[];
  readonly tools?: Record<string, unknown>;
  readonly runtime?: Record<string, unknown>;
  readonly environment?: Record<string, unknown>;
  readonly input?: Record<string, unknown>;
}

interface RunTraceEventDto {
  readonly seq: number;
  readonly event: unknown;
  readonly created_at: string;
}

interface RunTraceDto {
  readonly run_id: string;
  readonly events?: readonly RunTraceEventDto[];
  readonly next_cursor?: string;
  /** Legacy Rust reliability read model retained for mixed-version servers. */
  readonly trace?: readonly RunTraceSpanDto[];
}

interface RunTraceSpanDto {
  readonly trace_id: string;
  readonly span_id: string;
  readonly parent_span_id: string | null;
  readonly run_id: string;
  readonly root_run_id: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly attributes: Record<string, unknown>;
  readonly error: RunTraceErrorDto | null;
}

interface RunTraceErrorDto {
  readonly category: string;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly source: string;
}

interface RunReportDto {
  readonly run_id: string;
  readonly markdown: string;
}

interface RunValidationDto {
  readonly run_id?: string;
  readonly validations?: readonly {
    readonly name: string;
    readonly passed: boolean;
    readonly details: unknown;
    readonly created_at: string;
  }[];
  /** Legacy Rust reliability read model retained for mixed-version servers. */
  readonly status?: 'valid' | 'repaired' | 'invalid' | 'skipped';
  readonly contract_id?: string;
  readonly contract_version?: string;
  readonly attempts?: number;
  readonly errors?: readonly { readonly path: string; readonly message: string }[];
  readonly output_hash?: string;
  readonly validated_at?: string;
}

interface ApprovalDto {
  readonly id: string;
  readonly tool_call_id: string;
  readonly action: string;
  readonly arguments_hash: string;
  readonly preview: string;
  readonly status: ChatApproval['status'];
  readonly created_at: string;
  readonly expires_at: string;
  readonly decided_at?: string;
}

interface ApprovalDecisionDto extends ApprovalDto {
  readonly continuation_run_id?: string | null;
}

interface GovernanceEvidencePageDto {
  readonly items: readonly {
    readonly id: string;
    readonly owner: string;
    readonly run_id: string;
    readonly seq: number;
    readonly at: string;
    readonly kind: GovernanceEvidencePage['items'][number]['kind'];
    readonly detail: Record<string, unknown>;
  }[];
  readonly next_cursor?: string;
}

interface RunGovernanceDto {
  readonly policy_revision: string;
  readonly admitted_at: string;
  readonly policy: RunGovernance['policy'];
  readonly owner: string;
  readonly run_id: string;
  readonly data_scope?: { readonly catalog?: string; readonly schema: string } | null;
}

/**
 * The one minder-agent response in this file that is genuinely camelCase
 * on the wire (`RunMetricsSummary` in `minder-reliability`'s `trace.rs` is
 * the only `#[serde(rename_all = "camelCase")]` struct among these
 * read-models — everything else here is `snake_case`). Not a typo — keep
 * this DTO camelCase if this file is ever regenerated or hand-verified
 * against the Rust source again.
 */
interface RoomMetricsDto {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly skipped: number;
  readonly running: number;
  readonly p50DurationMs: number | null;
  readonly p95DurationMs: number | null;
}

/**
 * Core's `RunFileEntryResponseDto` (see generated `schema.d.ts`) — camelCase
 * on the wire, unlike minder-agent's snake_case read-models above. Mapping is
 * near pass-through, but done explicitly so the Entity boundary stays typed.
 */
interface RunFileEntryDto {
  readonly path: string;
  readonly accessType: 'read' | 'created' | 'modified';
  readonly toolName: string;
  readonly accessedAt: string;
  readonly available: boolean;
  readonly sizeBytes?: number;
  readonly mimeType?: string;
}

interface RunFileListDto {
  readonly files?: readonly RunFileEntryDto[];
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

function recordField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const field = value[key];
  return isRecord(field) ? field : {};
}

function manifestSkills(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((skill) => {
    if (typeof skill === 'string') return { name: skill };
    return isRecord(skill) ? skill : { value: skill };
  });
}

function toRunManifest(dto: RunManifestDto): RunManifest {
  if (dto.manifest === undefined && dto.manifest_id !== undefined) {
    return {
      manifestVersion: dto.manifest_version ?? 1,
      manifestId: dto.manifest_id,
      runId: dto.run_id,
      sessionId: dto.session_id ?? null,
      parentRunId: dto.parent_run_id ?? null,
      rootRunId: dto.root_run_id ?? dto.run_id,
      agent: dto.agent ?? {},
      model: dto.model ?? {},
      instructions: dto.instructions ?? {},
      skills: dto.skills ?? [],
      tools: dto.tools ?? {},
      runtime: dto.runtime ?? {},
      environment: dto.environment ?? {},
      input: dto.input ?? {},
    };
  }
  const manifest = isRecord(dto.manifest) ? dto.manifest : {};
  const execution = recordField(manifest, 'execution');
  const runtime = {
    ...(Object.keys(execution).length === 0 ? {} : { execution }),
    ...(manifest.workingDirectory === undefined
      ? {}
      : { workingDirectory: manifest.workingDirectory }),
  };
  return {
    manifestVersion: 1,
    manifestId: dto.manifest_name ?? dto.content_hash ?? dto.run_id,
    runId: dto.run_id,
    sessionId: null,
    parentRunId: null,
    rootRunId: dto.run_id,
    agent: {
      ...(stringField(manifest, 'owner') === undefined
        ? {}
        : { owner: stringField(manifest, 'owner') }),
      ...(isRecord(manifest.agent) ? manifest.agent : {}),
    },
    model: recordField(manifest, 'model'),
    instructions: {
      ...(manifest.systemPrompt === undefined ? {} : { systemPrompt: manifest.systemPrompt }),
      ...(dto.yaml === undefined ? {} : { yaml: dto.yaml }),
    },
    skills: manifestSkills(manifest.skills),
    tools: recordField(manifest, 'tools'),
    runtime,
    environment: {},
    input: {},
  };
}

function toRunTraceSpan(runId: string, event: RunTraceEventDto): RunTraceSpan {
  const payload = isRecord(event.event) ? event.event : { value: event.event };
  const name = stringField(payload, 'type') ?? `event_${event.seq}`;
  const isFailure = name === 'error' || name.endsWith('_failed') || name === 'run_error';
  const status = isFailure ? 'failed' : 'succeeded';
  const errorMessage = isFailure ? stringField(payload, 'message') : undefined;
  return {
    traceId: `${runId}:${event.seq}`,
    spanId: `${runId}:${event.seq}`,
    parentSpanId: null,
    runId,
    rootRunId: runId,
    name,
    kind: name,
    status,
    startedAt: event.created_at,
    endedAt: event.created_at,
    attributes: { ...payload, seq: event.seq },
    error:
      errorMessage === undefined
        ? null
        : {
            category: 'run_event',
            code: name,
            message: errorMessage,
            retryable: false,
            source: 'minder-agent',
          },
  };
}

function validationDetails(details: unknown): string {
  if (typeof details === 'string') return details;
  if (isRecord(details)) {
    const error = details.error;
    if (typeof error === 'string') return error;
    const status = details.status;
    if (typeof status === 'string') return status;
  }
  return 'Validation failed.';
}

function toRunValidation(dto: RunValidationDto): RunValidation {
  if (dto.validations === undefined) {
    return {
      status: dto.status ?? 'skipped',
      contractId: dto.contract_id ?? 'run_validations',
      contractVersion: dto.contract_version ?? '1',
      attempts: dto.attempts ?? 0,
      errors: dto.errors ?? [],
      outputHash: dto.output_hash ?? '',
      validatedAt: dto.validated_at ?? '',
    };
  }
  const validations = dto.validations;
  const failures = validations.filter((validation) => !validation.passed);
  const last = validations.at(-1);
  return {
    status: validations.length === 0 ? 'skipped' : failures.length === 0 ? 'valid' : 'invalid',
    contractId: 'run_validations',
    contractVersion: '1',
    attempts: validations.length,
    errors: failures.map((validation) => ({
      path: validation.name,
      message: validationDetails(validation.details),
    })),
    outputHash: '',
    validatedAt: last?.created_at ?? '',
  };
}

/**
 * Talks to minder-agent's `/rooms` surface (`crates/minder-serve/src/rooms.rs`),
 * not the Core API — every request needs `X-Caller-Id` (see
 * `crates/minder-serve/src/auth.rs`), which the Core API does not use.
 */
export class AgentApiChatRepository implements ChatRepository {
  public constructor(
    private readonly transport: GeneratedApiTransport,
    private readonly coreTransport?: GeneratedApiTransport,
  ) {}

  public async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const agentName = input.agent ?? publicEnvironment.chatAgentName;
    const roomId =
      input.roomId ??
      (await this.createRoom(input.userId, input.sessionKey, agentName, input.title));
    if (input.roomId !== null) {
      await this.bindRoom(roomId, agentName);
    }
    const runId = crypto.randomUUID();
    await this.registerRun(roomId, runId, agentName, input.dataScope ?? null);
    let dto: RoomRunStartedDto;
    try {
      dto = await this.request<RoomRunStartedDto>(
        `/rooms/${encodeURIComponent(roomId)}/runs`,
        input.userId,
        {
          method: 'POST',
          // `kind` defaults to "ephemeral" server-side (minder-serve's
          // RoomRunBody), which never attaches a session — every turn starts
          // with zero prior history. "session_bound" reuses one session per
          // (room, agent), which is what lets the agent remember earlier turns
          // in this conversation.
          body: JSON.stringify({
            run_id: runId,
            agent: agentName,
            input: input.message,
            kind: 'session_bound',
            // Omitted entirely when unscoped: the agent reads an absent scope as
            // "no restriction", and an empty object would be a scope matching no
            // database at all.
            ...(input.dataScope === undefined ? {} : { data_scope: input.dataScope }),
            ...(input.context === undefined
              ? {}
              : {
                  context: {
                    kind: input.context.kind,
                    workflow_id: input.context.workflowId,
                    workflow_name: input.context.workflowName,
                  },
                }),
            ...(input.plantModelScope === undefined
              ? {}
              : { plant_model_scope: input.plantModelScope }),
          }),
        },
      );
      if (dto.run_id !== runId || dto.room_id !== roomId)
        throw new Error('Agent admission did not preserve the Core-registered room and run ID');
    } catch (error) {
      await this.closeRunRegistration(roomId, runId).catch(() => undefined);
      throw error;
    }
    return {
      runId: dto.run_id,
      roomId: dto.room_id,
      roomEventsUrl: dto.room_events_url,
      queuePosition: dto.queue_position,
    };
  }

  public async streamEvents(
    userId: string,
    roomId: string,
    from?: string,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const suffix = from === undefined ? '' : `?cursor=${encodeURIComponent(from)}`;
    const response = await this.stream(
      `/rooms/${encodeURIComponent(roomId)}/events${suffix}`,
      userId,
      signal,
    );
    if (!response.body) {
      throw translateCoreApiError(new Error('Room SSE stream has no body'));
    }
    return response.body;
  }

  public async streamRunEvents(
    userId: string,
    runId: string,
    from?: string,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const suffix = from === undefined ? '' : `?cursor=${encodeURIComponent(from)}`;
    const response = await this.stream(
      `/runs/${encodeURIComponent(runId)}/events${suffix}`,
      userId,
      signal,
    );
    if (!response.body) {
      throw translateCoreApiError(new Error('Run SSE stream has no body'));
    }
    return response.body;
  }

  /**
   * Every past conversation the caller has a room for, newest first (server
   * order — `list_rooms` sorts by `created_at DESC`). A room without a `key`
   * was not created by celesnity-web (see `createRoom`, which always sets
   * one) and has no known `sessionKey` to hydrate messages with later, so
   * it's skipped rather than surfaced with a broken session id.
   */
  public async listSessions(userId: string): Promise<readonly ChatSessionSummary[]> {
    const rooms = await this.request<readonly RoomDto[]>('/rooms', userId, { method: 'GET' });
    return rooms
      .filter((room): room is RoomDto & { key: string } => Boolean(room.key))
      .map((room) => ({
        id: room.key,
        roomId: room.id,
        title: room.name ?? room.key,
        ...(room.members?.[0] === undefined ? {} : { agentName: room.members[0] }),
      }));
  }

  /**
   * A room's key (the id celesnity-web chose when it created the room) is
   * *not* the session-bound run's session key — minder-agent derives that
   * internally as `room:<room.id>:agent:<agent name>` (see
   * `rooms-http.ts`), keyed by the room's own server-assigned id and the
   * manifest name. `roomId` here is that
   * server-assigned id (`ChatSession.roomId` / `SendMessageResult.roomId`),
   * not the room's `key`.
   */
  public async getSessionTranscript(
    userId: string,
    roomId: string,
    agentName = publicEnvironment.chatAgentName,
  ): Promise<readonly ChatTranscriptMessage[]> {
    return (await this.getSessionState(userId, roomId, agentName)).transcript;
  }

  public async getSessionState(
    userId: string,
    roomId: string,
    agentName = publicEnvironment.chatAgentName,
  ): Promise<ChatSessionState> {
    // Room runs use the manifest name directly in the session key. The
    // `/agents` configuration API is a separate, optional registry and is not
    // the source of truth for manifest-backed room members.
    const sessionKey = `room:${roomId}:agent:${agentName}`;
    const session = await this.request<SessionDto>(
      `/sessions/${encodeURIComponent(sessionKey)}`,
      userId,
      { method: 'GET' },
    );
    const pendingApproval = toPendingApproval(session.pending_approval);
    return {
      transcript: await this.getSessionTranscriptById(userId, session.id),
      pendingQuestion: toAskUserRequest(session.pending_question),
      ...(pendingApproval === null ? {} : { pendingApproval }),
    };
  }

  public async getRoomHistory(userId: string, roomId: string): Promise<readonly ChatHistoryRun[]> {
    const history = await this.request<RoomHistoryDto>(
      `/rooms/${encodeURIComponent(roomId)}/history`,
      userId,
      { method: 'GET' },
    );
    return history.runs.map((run) => ({
      runId: run.run_id,
      sessionId: run.session_id,
      input: run.input,
      status: run.status,
      createdAt: run.created_at,
      finishedAt: run.finished_at,
      responseText: run.response_text,
      events: run.events,
    }));
  }

  public async resetConversation(userId: string, roomId: string, agentName: string): Promise<void> {
    await this.request<void>(
      `/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(agentName)}/session/reset`,
      userId,
      { method: 'POST' },
    );
  }

  /**
   * Same read as `getSessionTranscript`, minus the key lookup — for a
   * caller (the run inspector) that already has the real session id off a
   * run's manifest (`RunManifest.sessionId`), not a room to derive a key
   * from (an automation-dispatched run has no room at all).
   */
  public async getSessionTranscriptById(
    userId: string,
    sessionId: string,
  ): Promise<readonly ChatTranscriptMessage[]> {
    const transcript = await this.request<SessionTranscriptDto>(
      `/sessions/${encodeURIComponent(sessionId)}/transcript`,
      userId,
      { method: 'GET' },
    );
    return transcript.history.flatMap(toTranscriptMessage);
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const response = await this.transport.request<HealthzDto>('/healthz', { method: 'GET' });
      return response.status === 'ok';
    } catch {
      return false;
    }
  }

  public async getRunManifest(userId: string, runId: string): Promise<RunManifest> {
    const dto = await this.request<RunManifestDto>(
      `/runs/${encodeURIComponent(runId)}/manifest`,
      userId,
      { method: 'GET' },
    );
    return toRunManifest(dto);
  }

  public async getRunTrace(userId: string, runId: string): Promise<readonly RunTraceSpan[]> {
    const spans: RunTraceSpan[] = [];
    const events: RunTraceEventDto[] = [];
    let cursor: string | undefined;
    do {
      const suffix = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}&limit=500`;
      const dto = await this.request<RunTraceDto>(
        `/runs/${encodeURIComponent(runId)}/trace${suffix}`,
        userId,
        { method: 'GET' },
      );
      if (dto.trace !== undefined) {
        spans.push(
          ...dto.trace.map((span) => ({
            traceId: span.trace_id,
            spanId: span.span_id,
            parentSpanId: span.parent_span_id,
            runId: span.run_id,
            rootRunId: span.root_run_id,
            name: span.name,
            kind: span.kind,
            status: span.status,
            startedAt: span.started_at,
            endedAt: span.ended_at,
            attributes: span.attributes,
            error: span.error,
          })),
        );
        break;
      }
      events.push(...(dto.events ?? []));
      const next = dto.next_cursor;
      cursor = next === undefined || next === cursor ? undefined : next;
    } while (cursor !== undefined);
    return spans.length > 0 ? spans : events.map((event) => toRunTraceSpan(runId, event));
  }

  public async getRunReport(userId: string, runId: string): Promise<RunReport> {
    const dto = await this.request<RunReportDto>(
      `/runs/${encodeURIComponent(runId)}/report`,
      userId,
      { method: 'GET' },
    );
    return { runId: dto.run_id, markdown: dto.markdown };
  }

  public async getRunGovernance(userId: string, runId: string): Promise<RunGovernance> {
    const dto = await this.request<RunGovernanceDto>(
      `/runs/${encodeURIComponent(runId)}/governance`,
      userId,
      {
        method: 'GET',
      },
    );
    return {
      policyRevision: dto.policy_revision,
      admittedAt: dto.admitted_at,
      policy: dto.policy,
      owner: dto.owner,
      runId: dto.run_id,
      dataScope: dto.data_scope ?? null,
    };
  }

  public async getRunGovernanceEvidence(
    userId: string,
    runId: string,
    cursor?: string,
  ): Promise<GovernanceEvidencePage> {
    const suffix = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
    const dto = await this.request<GovernanceEvidencePageDto>(
      `/runs/${encodeURIComponent(runId)}/governance/evidence${suffix}`,
      userId,
      { method: 'GET' },
    );
    return {
      items: dto.items.map((item) => ({
        id: item.id,
        owner: item.owner,
        runId: item.run_id,
        seq: item.seq,
        at: item.at,
        kind: item.kind,
        detail: item.detail,
      })),
      ...(dto.next_cursor === undefined ? {} : { nextCursor: dto.next_cursor }),
    };
  }

  public async getRunValidation(userId: string, runId: string): Promise<RunValidation> {
    const dto = await this.request<RunValidationDto>(
      `/runs/${encodeURIComponent(runId)}/validation`,
      userId,
      { method: 'GET' },
    );
    return toRunValidation(dto);
  }

  public async getRoomMetrics(userId: string, roomId: string): Promise<RoomMetrics> {
    const dto = await this.request<RoomMetricsDto>(
      `/rooms/${encodeURIComponent(roomId)}/metrics`,
      userId,
      { method: 'GET' },
    );
    return {
      total: dto.total,
      succeeded: dto.succeeded,
      failed: dto.failed,
      cancelled: dto.cancelled,
      skipped: dto.skipped,
      running: dto.running,
      p50DurationMs: dto.p50DurationMs,
      p95DurationMs: dto.p95DurationMs,
    };
  }

  public async listRunApprovals(userId: string, runId: string): Promise<readonly ChatApproval[]> {
    const values = await this.request<readonly ApprovalDto[]>(
      `/runs/${encodeURIComponent(runId)}/approvals`,
      userId,
      { method: 'GET' },
    );
    return values.map(toChatApproval);
  }

  public async decideRunApproval(
    userId: string,
    runId: string,
    approvalId: string,
    decision: ChatApprovalDecision,
  ): Promise<ChatApprovalDecisionResult> {
    const value = await this.request<ApprovalDecisionDto>(
      `/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/decision`,
      userId,
      { method: 'POST', body: JSON.stringify({ decision }) },
    );
    return {
      ...toChatApproval(value),
      continuationRunId: value.continuation_run_id ?? null,
    } satisfies ChatApprovalDecisionResult;
  }

  /**
   * SECURITY: the run-file surface lives on celesnity-core (org-scoped by B3),
   * so it MUST go through `coreTransport`, never the agent `transport` — the
   * agent gateway exposes the same paths but does not enforce core's org
   * scoping, so routing here would bypass authorization.
   */
  public async listRunFiles(userId: string, runId: string): Promise<readonly RunFileEntry[]> {
    const core = this.requireCoreTransport();
    let dto: RunFileListDto;
    try {
      dto = await core.request<RunFileListDto>(`/runs/${encodeURIComponent(runId)}/files`, {
        headers: { 'X-Caller-Id': userId },
      });
    } catch (error) {
      throw translateCoreApiError(error);
    }
    return (dto.files ?? []).map((file) => ({
      path: file.path,
      accessType: file.accessType,
      toolName: file.toolName,
      accessedAt: file.accessedAt,
      available: file.available,
      ...(file.sizeBytes === undefined ? {} : { sizeBytes: file.sizeBytes }),
      ...(file.mimeType === undefined ? {} : { mimeType: file.mimeType }),
    }));
  }

  /**
   * Streamed from `coreTransport` (see `listRunFiles` for the security ruling).
   * `stream()` returns the raw `Response` so the file bytes reach the caller as
   * a `Blob` — the parsed `request()` path cannot carry binary content.
   */
  public async getRunFileContent(
    userId: string,
    runId: string,
    path: string,
  ): Promise<RunFileContent> {
    const core = this.requireCoreTransport();
    let response: Response;
    try {
      response = await core.stream(
        `/runs/${encodeURIComponent(runId)}/files/content?path=${encodeURIComponent(path)}`,
        { headers: { 'X-Caller-Id': userId } },
      );
    } catch (error) {
      throw translateCoreApiError(error);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return {
      blob,
      mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
      sizeBytes: blob.size,
      fileName: match?.[1] ?? path.split('/').pop() ?? 'download',
    };
  }

  private requireCoreTransport(): GeneratedApiTransport {
    if (this.coreTransport === undefined) {
      throw translateCoreApiError(new Error('Core transport is required for run-file operations'));
    }
    return this.coreTransport;
  }

  /**
   * A room is created once per session and its id is meant to be cached by
   * the caller (see `chat-storage.ts`) — this only runs on the very first
   * message of a session. `key` is scoped to `(X-Caller-Id, key)` on the
   * server, so it must vary per session, not just per user — reusing
   * `userId` here would make every session after the first collide with a
   * 409 on room creation. `key` is deterministic per session so a lost
   * response or local cache can be recovered from the authenticated caller's
   * `GET /rooms` result, and the transcript recovered through the same key.
   * Rebinding the recovered room in Core is idempotent.
   */
  private async createRoom(
    userId: string,
    sessionKey: string,
    agentName: string,
    title?: string,
  ): Promise<string> {
    let room: RoomDto;
    let recovered = false;
    try {
      room = await this.request<RoomDto>('/rooms', userId, {
        method: 'POST',
        body: JSON.stringify({
          // Falls back to a generic name only if the caller genuinely has no
          // title yet (e.g. an empty first message) — `listSessions` reads
          // this back as the conversation's title, so a real one matters.
          name: title && title.trim().length > 0 ? title : `chat-${userId}`,
          max_concurrent_runs: 1,
          key: sessionKey,
          members: [agentName],
        }),
      });
    } catch (error: unknown) {
      if (!(error instanceof ConflictError)) throw error;

      const rooms = await this.request<readonly RoomDto[]>('/rooms', userId, { method: 'GET' });
      const recoveredRoom = rooms.find((candidate) => candidate.key === sessionKey);
      if (recoveredRoom === undefined) throw error;
      room = recoveredRoom;
      recovered = true;
    }
    await this.bindRoom(room.id, agentName);
    // New rooms include the requested member in their creation payload. A
    // deterministic recovered room can outlive an agent migration, so
    // reconcile the member explicitly before its first dedicated-agent run.
    if (recovered) {
      await this.request<void>(`/rooms/${encodeURIComponent(room.id)}/members`, userId, {
        method: 'POST',
        body: JSON.stringify({ agent: agentName }),
      });
    }
    return room.id;
  }

  private async bindRoom(roomId: string, agentName: string): Promise<void> {
    if (this.coreTransport === undefined) {
      throw translateCoreApiError(new Error('Core room-binding transport is unavailable'));
    }
    try {
      await this.coreTransport.request<void>(
        `/rooms/${encodeURIComponent(roomId)}/message-blocks/bind`,
        { method: 'POST', body: JSON.stringify({ agentName }) },
      );
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  private async registerRun(
    roomId: string,
    runId: string,
    agentName: string,
    scope: { readonly catalog?: string; readonly schema: string } | null,
  ): Promise<void> {
    if (this.coreTransport === undefined)
      throw translateCoreApiError(new Error('Core run registration transport is unavailable'));
    try {
      const registration: components['schemas']['RegisterRunBody'] = { runId, agentName, scope };
      await this.coreTransport.request<void>(`/rooms/${encodeURIComponent(roomId)}/agent-runs`, {
        method: 'POST',
        body: JSON.stringify(registration),
      });
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async closeRunRegistration(roomId: string, runId: string): Promise<void> {
    await this.coreTransport?.request<void>(
      `/rooms/${encodeURIComponent(roomId)}/agent-runs/${encodeURIComponent(runId)}`,
      { method: 'DELETE' },
    );
  }

  private async request<TResponse>(
    path: string,
    userId: string,
    init: RequestInit,
  ): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, {
        ...init,
        headers: { ...init.headers, 'X-Caller-Id': userId },
      });
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  private async stream(path: string, userId: string, signal?: AbortSignal): Promise<Response> {
    try {
      return await this.transport.stream(path, {
        headers: { Accept: 'text/event-stream', 'X-Caller-Id': userId },
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function toTranscriptMessage(value: Record<string, unknown>): ChatTranscriptMessage[] {
  const role = value['role'];
  if (role !== 'user' && role !== 'assistant') return [];
  return [
    {
      role,
      content: contentText(value['content']),
      reasoning: typeof value['reasoning_content'] === 'string' ? value['reasoning_content'] : null,
    },
  ];
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      if (typeof part !== 'object' || part === null || Array.isArray(part)) return '';
      const text = (part as Record<string, unknown>)['text'];
      return typeof text === 'string' ? text : '';
    })
    .join('');
}

function toAskUserRequest(value: unknown): ChatAskUserRequest | null {
  if (!isRecord(value) || typeof value['question'] !== 'string') return null;
  const options = Array.isArray(value['options'])
    ? value['options'].flatMap((option) => {
        if (!isRecord(option) || typeof option['label'] !== 'string') return [];
        const description = option['description'];
        return [
          {
            label: option['label'],
            description: typeof description === 'string' ? description : null,
          },
        ];
      })
    : [];
  return {
    question: value['question'],
    options,
    allowOther: value['allow_other'] !== false,
  };
}

function toChatApproval(value: ApprovalDto): ChatApproval {
  return {
    id: value.id,
    toolCallId: value.tool_call_id,
    action: value.action,
    argumentsHash: value.arguments_hash,
    preview: value.preview,
    status: value.status,
    createdAt: value.created_at,
    expiresAt: value.expires_at,
    decidedAt: value.decided_at ?? null,
  };
}

function toPendingApproval(value: unknown): ChatPendingApproval | null {
  if (!isRecord(value)) return null;
  const approvalId = value['approval_id'];
  const action = value['action'];
  const preview = value['preview'];
  const expiresAt = value['expires_at'];
  if (
    typeof approvalId !== 'string' ||
    typeof action !== 'string' ||
    typeof preview !== 'string' ||
    typeof expiresAt !== 'string'
  ) {
    return null;
  }
  const runId = value['run_id'];
  return {
    ...(typeof runId === 'string' ? { runId } : {}),
    approvalId,
    action,
    preview,
    expiresAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
