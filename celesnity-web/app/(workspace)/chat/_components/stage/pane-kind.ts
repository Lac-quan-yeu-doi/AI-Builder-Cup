import {
  ChartColumnIcon,
  FileTextIcon,
  FolderTreeIcon,
  TerminalIcon,
  Table2Icon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';

import type { TranslationKey } from '@/app/_i18n/en';

import type { PaneKind } from './chat-stage.types';

/**
 * What each pane kind is called, and what it looks like.
 *
 * `labelKey` rather than a literal: these read out on a tab, and the six of
 * them used to stay in English while the rest of the workspace switched to
 * Vietnamese.
 */
export const KIND: Record<
  PaneKind,
  { readonly labelKey: TranslationKey; readonly Icon: LucideIcon }
> = {
  document: { labelKey: 'chat.pane.kind.document', Icon: FileTextIcon },
  chart: { labelKey: 'chat.pane.kind.chart', Icon: ChartColumnIcon },
  table: { labelKey: 'chat.pane.kind.table', Icon: Table2Icon },
  terminal: { labelKey: 'chat.pane.kind.terminal', Icon: TerminalIcon },
  automation: { labelKey: 'chat.pane.kind.automation', Icon: ZapIcon },
  workspace: { labelKey: 'chat.pane.kind.workspace', Icon: FolderTreeIcon },
};
