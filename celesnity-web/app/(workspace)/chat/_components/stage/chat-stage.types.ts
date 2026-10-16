export type PaneKind = 'document' | 'chart' | 'table' | 'terminal' | 'automation' | 'workspace';

export interface Artifact {
  readonly id: string;
  readonly kind: PaneKind;
  readonly title: string;
  readonly meta: string;
  readonly versions?: number;
}

export interface Pane {
  readonly id: string;
  readonly tabs: readonly Artifact[];
  readonly activeId: string;
}

export interface Column {
  readonly id: string;
  readonly panes: readonly Pane[];
}

export interface Stage {
  readonly columns: readonly Column[];
  readonly focused: string | null;
  readonly maximized: string | null;
  readonly open: boolean;
}

export type Placement = 'focus' | 'right' | 'down';

export type StageAction =
  | { type: 'open'; artifact: Artifact; placement?: Placement }
  | { type: 'activate'; paneId: string; tabId: string }
  | { type: 'closeTab'; paneId: string; tabId: string }
  | { type: 'closeOthers'; paneId: string; tabId: string }
  | { type: 'closePane'; paneId: string }
  | { type: 'toggleMax'; paneId: string }
  | { type: 'split'; paneId: string; tabId: string; dir: 'right' | 'down' }
  | { type: 'focus'; paneId: string }
  | { type: 'setOpen'; open: boolean }
  | { type: 'load'; stage: Stage };
