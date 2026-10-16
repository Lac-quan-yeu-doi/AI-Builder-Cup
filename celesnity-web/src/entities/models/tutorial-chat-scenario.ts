export const tutorialChatScenarioIds = [
  'agent-ask-data',
  'agent-create-artifacts',
  'agent-clarify-approve',
  'agent-files-conversations',
] as const;

export type TutorialChatScenarioId = (typeof tutorialChatScenarioIds)[number];

export type TutorialChatEvent =
  | 'SELECT_DATABASE'
  | 'SEND_QUESTION'
  | 'OPEN_REASONING'
  | 'SEND_TABLE_REQUEST'
  | 'OPEN_TABLE'
  | 'SEND_CHART_REQUEST'
  | 'OPEN_CHART'
  | 'SEND_REPORT_REQUEST'
  | 'OPEN_REPORT'
  | 'SEND_SAVE_REQUEST'
  | 'ANSWER_CLARIFICATION'
  | 'APPROVE_WRITE'
  | 'DENY_WRITE'
  | 'ATTACH_SAMPLE'
  | 'SEND_FILE_QUESTION'
  | 'CREATE_THREAD'
  | 'SEND_SECOND_QUESTION'
  | 'OPEN_HISTORY'
  | 'SWITCH_FIRST_THREAD';

export interface TutorialChatScenarioState {
  readonly scenarioId: TutorialChatScenarioId;
  readonly completedEvents: readonly TutorialChatEvent[];
  readonly deniedWrite: boolean;
}

const SEQUENCES: Readonly<Record<TutorialChatScenarioId, readonly TutorialChatEvent[]>> = {
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

export function isTutorialChatScenarioId(value: string): value is TutorialChatScenarioId {
  return (tutorialChatScenarioIds as readonly string[]).includes(value);
}

export function createTutorialChatScenarioState(
  scenarioId: TutorialChatScenarioId,
): TutorialChatScenarioState {
  return { scenarioId, completedEvents: [], deniedWrite: false };
}

export function expectedTutorialChatEvent(
  state: TutorialChatScenarioState,
): TutorialChatEvent | null {
  return SEQUENCES[state.scenarioId][state.completedEvents.length] ?? null;
}

/** Deterministic state transition. Unexpected actions never advance a walkthrough. */
export function advanceTutorialChatScenario(
  state: TutorialChatScenarioState,
  event: TutorialChatEvent,
): TutorialChatScenarioState {
  if (event === 'DENY_WRITE' && state.scenarioId === 'agent-clarify-approve') {
    return { ...state, deniedWrite: true };
  }
  if (event !== expectedTutorialChatEvent(state)) return state;
  return {
    ...state,
    completedEvents: [...state.completedEvents, event],
    deniedWrite: event === 'APPROVE_WRITE' ? false : state.deniedWrite,
  };
}
