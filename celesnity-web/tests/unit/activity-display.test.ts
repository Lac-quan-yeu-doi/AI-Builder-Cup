import { describe, expect, it } from 'vitest';

import {
  activityDetail,
  activityLabelKey,
  isVisibleActivityEvent,
  runErrorFromEvent,
  shouldShowStructuredRunError,
  toolLabelKey,
  toFriendlyRunError,
} from '../../app/_components/chat/activity-display';

describe('chat activity display', () => {
  it('filters duplicate transcript and tool lifecycle events from activity chips', () => {
    expect(isVisibleActivityEvent('token_usage')).toBe(false);
    expect(isVisibleActivityEvent('done')).toBe(false);
    expect(isVisibleActivityEvent('run_finished')).toBe(false);
    expect(isVisibleActivityEvent('stream_delta')).toBe(false);
    expect(isVisibleActivityEvent('text')).toBe(false);
    expect(isVisibleActivityEvent('reasoning')).toBe(false);
    expect(isVisibleActivityEvent('tool_started')).toBe(false);
    expect(isVisibleActivityEvent('tool_finished')).toBe(false);
    expect(isVisibleActivityEvent('tool_result')).toBe(false);
    expect(isVisibleActivityEvent('awaiting_approval')).toBe(true);
    expect(isVisibleActivityEvent('tool_progress')).toBe(true);
    expect(isVisibleActivityEvent('workspace_changed')).toBe(true);
  });

  it('maps internal activity names to friendly translation keys', () => {
    expect(activityLabelKey('tool_started')).toBe('chat.activity.working');
    expect(activityLabelKey('tool_finished')).toBe('chat.activity.completed');
    expect(activityLabelKey('awaiting_approval')).toBe('chat.activity.needsApproval');
    expect(activityLabelKey('workspace_changed')).toBe('chat.activity.workspaceUpdated');
    expect(activityLabelKey('tool_progress')).toBe('chat.activity.toolProgress');
  });

  it('uses specific labels for skill MCP operations', () => {
    expect(toolLabelKey('mcp__skill__create_skill')).toBe('chat.activity.skillCreate');
    expect(toolLabelKey('mcp__skill__list_skills')).toBe('chat.activity.skillRead');
    expect(toolLabelKey('mcp__skill__update_skill')).toBe('chat.activity.skillUpdate');
    expect(toolLabelKey('mcp__skill__delete_skill')).toBe('chat.activity.skillDelete');
  });

  it('summarizes durable workspace and progress payloads without exposing raw JSON', () => {
    expect(
      activityDetail('workspace_changed', {
        changes: [{ rel_path: 'report.md', kind: 'modified' }],
      }),
    ).toBe('report.md');
    expect(
      activityDetail('tool_progress', {
        id: 'progress-1',
        kind: 'progress',
        payload: { message: 'Searching files' },
      }),
    ).toBe('Searching files');
  });

  it('maps the legacy governance restart failure to a retryable friendly error', () => {
    expect(toFriendlyRunError('governance policy unavailable after restart')).toEqual({
      code: 'governance_unavailable',
      retryable: true,
      messageKey: 'chat.runError.governanceUnavailable',
    });
  });

  it('preserves typed backend error metadata', () => {
    expect(
      toFriendlyRunError({
        code: 'governance_unavailable',
        userMessage: 'Access is temporarily unavailable.',
        retryable: true,
      }),
    ).toEqual({
      code: 'governance_unavailable',
      retryable: true,
      message: 'Access is temporarily unavailable.',
    });
  });

  it('recognizes the structured code on a durable tool result event', () => {
    expect(
      runErrorFromEvent('tool_result', {
        metadata: { error_code: 'policy_unavailable' },
      }),
    ).toEqual({
      code: 'governance_unavailable',
      retryable: true,
      messageKey: 'chat.runError.governanceUnavailable',
    });
  });

  it('only replaces known technical transport errors with a structured message', () => {
    expect(shouldShowStructuredRunError('Core API request failed with 500')).toBe(true);
    expect(shouldShowStructuredRunError('Agent unreachable')).toBe(false);
  });
});
