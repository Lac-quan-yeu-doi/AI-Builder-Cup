import type { DashboardRuntimeCard } from '@/src/entities/models/dashboard-runtime';

export interface DashboardRuntimeCardState {
  readonly status:
    'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR' | 'RESTRICTED' | 'TIMEOUT' | 'REQUIRES_FILTER';
  readonly result?: unknown;
  readonly message?: string;
}

export interface DashboardRuntimeState {
  readonly cards: Readonly<Record<string, DashboardRuntimeCardState>>;
}

export type DashboardRuntimeAction =
  | { readonly type: 'reset'; readonly cardIds: readonly string[] }
  | { readonly type: 'started'; readonly cardIds: readonly string[] }
  | { readonly type: 'resolved'; readonly cards: readonly DashboardRuntimeCard[] };

export function createDashboardRuntimeState(cardIds: readonly string[]): DashboardRuntimeState {
  return {
    cards: Object.fromEntries(cardIds.map((cardId) => [cardId, { status: 'IDLE' as const }])),
  };
}

export function dashboardRuntimeReducer(
  state: DashboardRuntimeState,
  action: DashboardRuntimeAction,
): DashboardRuntimeState {
  const cards = { ...state.cards };
  if (action.type === 'reset') return createDashboardRuntimeState(action.cardIds);
  if (action.type === 'started') {
    for (const cardId of action.cardIds) cards[cardId] = { ...cards[cardId], status: 'LOADING' };
    return { cards };
  }
  for (const card of action.cards) {
    if (card.state === 'UNCHANGED') continue;
    if (card.state === 'SUCCESS') cards[card.cardId] = { status: 'SUCCESS', result: card.result };
    else if (card.state === 'REQUIRES_FILTER') cards[card.cardId] = { status: 'REQUIRES_FILTER' };
    else if ('message' in card) cards[card.cardId] = { status: card.state, message: card.message };
  }
  return { cards };
}
