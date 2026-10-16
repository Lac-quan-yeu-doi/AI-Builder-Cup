import { describe, expect, it } from 'vitest';

import {
  advanceTutorialChatScenario,
  createTutorialChatScenarioState,
  expectedTutorialChatEvent,
  type TutorialChatEvent,
  type TutorialChatScenarioId,
} from '@/src/entities/models/tutorial-chat-scenario';

const sequences: Readonly<Record<TutorialChatScenarioId, readonly TutorialChatEvent[]>> = {
  'agent-ask-data': ['SELECT_DATABASE', 'SEND_QUESTION', 'OPEN_REASONING', 'OPEN_TABLE'],
  'agent-create-artifacts': [
    'SEND_TABLE_REQUEST',
    'OPEN_TABLE',
    'SEND_CHART_REQUEST',
    'OPEN_CHART',
    'SEND_REPORT_REQUEST',
    'OPEN_REPORT',
  ],
  'agent-clarify-approve': [
    'SEND_SAVE_REQUEST',
    'ANSWER_CLARIFICATION',
    'APPROVE_WRITE',
    'OPEN_REPORT',
  ],
  'agent-files-conversations': [
    'ATTACH_SAMPLE',
    'SEND_FILE_QUESTION',
    'CREATE_THREAD',
    'SEND_SECOND_QUESTION',
    'OPEN_HISTORY',
    'SWITCH_FIRST_THREAD',
  ],
};

describe('tutorial chat scenario state machine', () => {
  it.each(Object.entries(sequences))('completes %s only in its defined order', (id, events) => {
    let state = createTutorialChatScenarioState(id as TutorialChatScenarioId);
    for (const event of events) {
      expect(expectedTutorialChatEvent(state)).toBe(event);
      state = advanceTutorialChatScenario(state, event);
    }
    expect(expectedTutorialChatEvent(state)).toBeNull();
    expect(state.completedEvents).toEqual(events);
  });

  it('ignores out-of-order actions without mutating state', () => {
    const state = createTutorialChatScenarioState('agent-create-artifacts');
    expect(advanceTutorialChatScenario(state, 'OPEN_CHART')).toBe(state);
    expect(state.completedEvents).toEqual([]);
  });

  it('supports denial without completing approval and clears denial after retry approval', () => {
    let state = createTutorialChatScenarioState('agent-clarify-approve');
    state = advanceTutorialChatScenario(state, 'SEND_SAVE_REQUEST');
    state = advanceTutorialChatScenario(state, 'ANSWER_CLARIFICATION');
    state = advanceTutorialChatScenario(state, 'DENY_WRITE');
    expect(state.deniedWrite).toBe(true);
    expect(expectedTutorialChatEvent(state)).toBe('APPROVE_WRITE');

    state = advanceTutorialChatScenario(state, 'APPROVE_WRITE');
    expect(state.deniedWrite).toBe(false);
    expect(expectedTutorialChatEvent(state)).toBe('OPEN_REPORT');
  });

  it('creates a clean isolated state for every repeat', () => {
    const first = advanceTutorialChatScenario(
      createTutorialChatScenarioState('agent-ask-data'),
      'SELECT_DATABASE',
    );
    const repeated = createTutorialChatScenarioState('agent-ask-data');
    expect(first.completedEvents).toEqual(['SELECT_DATABASE']);
    expect(repeated).toEqual({
      scenarioId: 'agent-ask-data',
      completedEvents: [],
      deniedWrite: false,
    });
  });
});
