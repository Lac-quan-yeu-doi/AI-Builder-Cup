import type { TranslationKey } from '@/app/_i18n/en';

const HIDDEN_ACTIVITY_EVENTS = new Set([
  'text',
  'reasoning',
  'token_usage',
  'context_usage',
  'done',
  'run_finished',
  'stream_delta',
  'tool_started',
  'tool_finished',
  'tool_result',
]);

export type FriendlyRunErrorCode = 'governance_unavailable' | 'retryable' | 'unknown';

export interface FriendlyRunError {
  readonly code: FriendlyRunErrorCode;
  readonly retryable: boolean;
  readonly message?: string;
  readonly messageKey?: Extract<TranslationKey, `chat.${string}`>;
}

export function isVisibleActivityEvent(type: string): boolean {
  return !HIDDEN_ACTIVITY_EVENTS.has(type);
}

export function activityLabelKey(type: string): Extract<TranslationKey, `chat.${string}`> {
  switch (type) {
    case 'tool_started':
      return 'chat.activity.working';
    case 'tool_finished':
    case 'tool_result':
      return 'chat.activity.completed';
    case 'awaiting_approval':
      return 'chat.activity.needsApproval';
    case 'awaiting_input':
      return 'chat.activity.needsInput';
    case 'awaiting_client_tool':
    case 'client_tool_call':
      return 'chat.activity.waitingForWorkspace';
    case 'workspace_changed':
      return 'chat.activity.workspaceUpdated';
    case 'tool_progress':
      return 'chat.activity.toolProgress';
    case 'reasoning':
      return 'chat.activity.considering';
    default:
      return 'chat.activity.updated';
  }
}

/** A bounded, human-readable activity detail for the compact run timeline. */
export function activityDetail(type: string, data: unknown): string | undefined {
  const record = asRecord(data);
  if (!record) return undefined;
  if (type === 'workspace_changed') {
    const changes = Array.isArray(record['changes']) ? record['changes'] : [];
    const paths = changes
      .map(asRecord)
      .map((change) => (change ? stringField(change, 'rel_path') : undefined))
      .filter((path): path is string => Boolean(path));
    if (paths.length === 0) return undefined;
    return paths.length > 2
      ? `${paths.slice(0, 2).join(', ')} +${paths.length - 2}`
      : paths.join(', ');
  }
  if (type === 'tool_progress') {
    const payload = asRecord(record['payload']);
    return payload ? stringField(payload, 'message') : undefined;
  }
  return undefined;
}

export function toolLabelKey(name: string): Extract<TranslationKey, `chat.${string}`> {
  const normalized = name.toLowerCase();
  if (normalized.includes('skill')) {
    if (normalized.includes('create')) return 'chat.activity.skillCreate';
    if (normalized.includes('update')) return 'chat.activity.skillUpdate';
    if (normalized.includes('delete')) return 'chat.activity.skillDelete';
    return 'chat.activity.skillRead';
  }
  if (
    normalized.includes('catalog') ||
    normalized.includes('query') ||
    normalized.includes('trino')
  ) {
    return 'chat.activity.data';
  }
  if (normalized.includes('mcp') || normalized.includes('http') || normalized.includes('web')) {
    return 'chat.activity.external';
  }
  if (
    normalized.includes('read') ||
    normalized.includes('file') ||
    normalized.includes('glob') ||
    normalized.includes('search')
  ) {
    return 'chat.activity.workspace';
  }
  return 'chat.activity.working';
}

export function toFriendlyRunError(value: unknown): FriendlyRunError {
  if (typeof value === 'string') {
    if (isGovernanceUnavailable(value)) {
      return {
        code: 'governance_unavailable',
        retryable: true,
        messageKey: 'chat.runError.governanceUnavailable',
      };
    }
    return { code: 'unknown', retryable: true, messageKey: 'chat.runError.generic' };
  }

  const record = asRecord(value);
  if (record) {
    const code = stringField(record, 'code');
    const userMessage = stringField(record, 'userMessage') ?? stringField(record, 'user_message');
    const retryable = record['retryable'] === false ? false : true;
    if (code === 'governance_unavailable' || code === 'policy_unavailable') {
      return {
        code: 'governance_unavailable',
        retryable,
        ...(userMessage
          ? { message: userMessage }
          : { messageKey: 'chat.runError.governanceUnavailable' }),
      };
    }
    if (userMessage) return { code: 'retryable', retryable, message: userMessage };
  }

  return { code: 'unknown', retryable: true, messageKey: 'chat.runError.generic' };
}

export function shouldShowStructuredRunError(value: unknown): boolean {
  if (asRecord(value)) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase();
  return (
    normalized.includes('governance policy unavailable') ||
    normalized.includes('core api request failed')
  );
}

export function runErrorFromEvent(type: string, data: unknown): FriendlyRunError | undefined {
  if (type !== 'run_finished' && type !== 'tool_result' && type !== 'tool_finished') {
    return undefined;
  }
  if (typeof data === 'string') {
    return isGovernanceUnavailable(data) ? toFriendlyRunError(data) : undefined;
  }
  const record = asRecord(data);
  if (!record) return undefined;
  const metadata = asRecord(record['metadata']);
  const errorValue = record['error'] ?? record['failure'] ?? record['user_error'];
  if (errorValue !== undefined) return toFriendlyRunError(errorValue);
  if (metadata) {
    const code = stringField(metadata, 'code') ?? stringField(metadata, 'error_code');
    if (code) return toFriendlyRunError({ code });
  }
  const content = stringField(record, 'content') ?? stringField(record, 'output');
  return content && isGovernanceUnavailable(content) ? toFriendlyRunError(content) : undefined;
}

function isGovernanceUnavailable(value: string): boolean {
  return value.toLowerCase().includes('governance policy unavailable');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === 'string' ? record[key] : undefined;
}
