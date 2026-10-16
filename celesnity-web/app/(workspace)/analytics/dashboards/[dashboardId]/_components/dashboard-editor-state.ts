import type {
  Dashboard,
  DashboardCard,
  DashboardFilter,
  DashboardFilterMapping,
  DashboardTab,
} from '@/src/entities/models/dashboard';

export interface DashboardEditorState {
  readonly server: Dashboard;
  readonly draft: Dashboard;
  readonly dirty: boolean;
  readonly status: 'idle' | 'saving' | 'error' | 'conflict';
  readonly error: string | null;
}

export type DashboardEditorAction =
  | { readonly type: 'rename'; readonly name: string; readonly description: string | null }
  | { readonly type: 'add-card'; readonly card: DashboardCard }
  | { readonly type: 'update-card'; readonly card: DashboardCard }
  | { readonly type: 'remove-card'; readonly cardId: string }
  | { readonly type: 'add-tab'; readonly tab: DashboardTab }
  | { readonly type: 'update-tab'; readonly tab: DashboardTab }
  | { readonly type: 'remove-tab'; readonly tabId: string }
  | { readonly type: 'add-filter'; readonly filter: DashboardFilter }
  | { readonly type: 'update-filter'; readonly filter: DashboardFilter }
  | {
      readonly type: 'replace-filter-mappings';
      readonly filterId: string;
      readonly mappings: readonly DashboardFilterMapping[];
    }
  | { readonly type: 'remove-filter'; readonly filterId: string }
  | { readonly type: 'save-started' }
  | { readonly type: 'save-succeeded'; readonly dashboard: Dashboard }
  | { readonly type: 'save-failed'; readonly message: string; readonly conflict: boolean }
  | { readonly type: 'reload'; readonly dashboard: Dashboard }
  | { readonly type: 'cancel' };

export function createDashboardEditorState(dashboard: Dashboard): DashboardEditorState {
  return { server: dashboard, draft: dashboard, dirty: false, status: 'idle', error: null };
}

export function dashboardEditorReducer(
  state: DashboardEditorState,
  action: DashboardEditorAction,
): DashboardEditorState {
  if (action.type === 'save-started') return { ...state, status: 'saving', error: null };
  if (action.type === 'save-succeeded' || action.type === 'reload') {
    return createDashboardEditorState(action.dashboard);
  }
  if (action.type === 'save-failed') {
    return {
      ...state,
      status: action.conflict ? 'conflict' : 'error',
      error: action.message,
    };
  }
  if (action.type === 'cancel') return createDashboardEditorState(state.server);

  let draft = state.draft;
  if (action.type === 'rename') {
    draft = { ...draft, name: action.name, description: action.description };
  } else if (action.type === 'add-card') {
    draft = { ...draft, cards: [...draft.cards, action.card] };
  } else if (action.type === 'update-card') {
    draft = {
      ...draft,
      cards: draft.cards.map((card) => (card.id === action.card.id ? action.card : card)),
    };
  } else if (action.type === 'remove-card') {
    draft = {
      ...draft,
      cards: draft.cards.filter((card) => card.id !== action.cardId),
      mappings: draft.mappings.filter((mapping) => mapping.cardId !== action.cardId),
      filters: draft.filters.filter(
        (filter) =>
          filter.placement.kind !== 'INLINE_CARD' || filter.placement.cardId !== action.cardId,
      ),
    };
  } else if (action.type === 'add-tab') {
    draft = { ...draft, tabs: [...draft.tabs, action.tab] };
  } else if (action.type === 'update-tab') {
    draft = {
      ...draft,
      tabs: draft.tabs.map((tab) => (tab.id === action.tab.id ? action.tab : tab)),
    };
  } else if (action.type === 'remove-tab') {
    const removedCardIds = new Set(
      draft.cards.filter((card) => card.tabId === action.tabId).map((card) => card.id),
    );
    draft = {
      ...draft,
      tabs: draft.tabs.filter((tab) => tab.id !== action.tabId),
      cards: draft.cards.filter((card) => card.tabId !== action.tabId),
      mappings: draft.mappings.filter((mapping) => !removedCardIds.has(mapping.cardId)),
      filters: draft.filters.map((filter) =>
        filter.placement.kind === 'INLINE_CARD' && removedCardIds.has(filter.placement.cardId)
          ? { ...filter, placement: { kind: 'TOP_OF_PAGE' as const } }
          : filter,
      ),
    };
  } else if (action.type === 'add-filter') {
    draft = { ...draft, filters: [...draft.filters, action.filter] };
  } else if (action.type === 'update-filter') {
    draft = {
      ...draft,
      filters: draft.filters.map((filter) =>
        filter.id === action.filter.id ? action.filter : filter,
      ),
    };
  } else if (action.type === 'replace-filter-mappings') {
    draft = {
      ...draft,
      mappings: [
        ...draft.mappings.filter((mapping) => mapping.filterId !== action.filterId),
        ...action.mappings,
      ],
    };
  } else if (action.type === 'remove-filter') {
    draft = {
      ...draft,
      filters: draft.filters.filter((filter) => filter.id !== action.filterId),
      mappings: draft.mappings.filter((mapping) => mapping.filterId !== action.filterId),
    };
  }

  return { ...state, draft, dirty: !sameDashboard(state.server, draft), error: null };
}

function sameDashboard(left: Dashboard, right: Dashboard): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
