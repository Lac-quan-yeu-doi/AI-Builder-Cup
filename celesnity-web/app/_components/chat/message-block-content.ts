import {
  parseChatChartPreview,
  type ChatChartPreview,
} from '@/src/entities/models/chat-chart-preview';

import type { TranslationKey } from '@/app/_i18n/en';

import type { MessageBlock } from './types';

export type ArtifactKind = 'chart' | 'table' | 'document';

/** One owner for what a chart and a table are called, on a card or on a tab. */
export const ARTIFACT_KIND_KEY: Readonly<Record<ArtifactKind, TranslationKey>> = {
  chart: 'chat.pane.kind.chart',
  table: 'chat.pane.kind.table',
  document: 'chat.artifact.kind.document',
};

export function artifactKindOf(block: MessageBlock): ArtifactKind {
  if (block.blockType === 'chart') return 'chart';
  if (block.blockType === 'table') return 'table';
  return 'document';
}

export interface TableBlockColumn {
  readonly key: string;
  readonly label: string;
  /** Right-aligns the column and lines its digits up. */
  readonly numeric: boolean;
}

export interface TableBlockContent {
  readonly title: string | null;
  readonly columns: readonly TableBlockColumn[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly footnote: string | null;
}

function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Reads a `table` block's payload.
 *
 * Unlike the `chart` block, which Core validates through
 * `chat-chart-preview.ts`, nothing describes this shape: the agent publishes
 * `{ title, columns, rows, footnote }` and the client has always read it
 * defensively. That stays true here. What changes is that the reading happens
 * once, in one place, so the card in the transcript and the pane on the stage
 * cannot disagree about how many rows there are.
 *
 * A column counts as numeric when every value that is present is a number.
 * An all-empty column is not numeric, since there is nothing to line up.
 */
export function readTableBlock(payload: Record<string, unknown>): TableBlockContent {
  const rawColumns = Array.isArray(payload['columns']) ? payload['columns'] : [];
  const rawRows = Array.isArray(payload['rows']) ? payload['rows'] : [];

  const rows = rawRows.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );

  const columns = rawColumns
    .filter(
      (column): column is Record<string, unknown> => typeof column === 'object' && column !== null,
    )
    .map((column, index) => {
      const key = text(column, 'key') ?? String(index);
      const present = rows.map((row) => row[key]).filter((value) => value !== null && value !== '');
      return {
        key,
        label: text(column, 'label') ?? key,
        numeric: present.length > 0 && present.every((value) => typeof value === 'number'),
      };
    });

  return {
    title: text(payload, 'title'),
    columns,
    rows,
    footnote: text(payload, 'footnote'),
  };
}

/** The parsed chart preview, or `null` when the payload is not one. */
export function readChartBlock(payload: Record<string, unknown>): ChatChartPreview | null {
  try {
    return parseChatChartPreview(payload);
  } catch {
    return null;
  }
}

/** Blocks that earn a card in the transcript and a pane on the stage. */
export function isArtifactBlock(block: MessageBlock): boolean {
  return (
    block.blockType === 'chart' || block.blockType === 'table' || block.blockType === 'document'
  );
}

/**
 * What the card shows under the title.
 *
 * The row count, because that is the one fact about a result somebody checks
 * before opening it.
 */
export function artifactTitleOf(block: MessageBlock): string | null {
  if (block.blockType === 'chart') return readChartBlock(block.payload)?.title ?? null;
  if (block.blockType === 'document') {
    return text(block.payload, 'filename') ?? text(block.payload, 'title');
  }
  return readTableBlock(block.payload).title;
}

export function artifactRowCountOf(block: MessageBlock): number | null {
  if (block.blockType === 'document') return null;
  if (block.blockType === 'chart') {
    const preview = readChartBlock(block.payload);
    return preview === null ? null : preview.rows.length;
  }
  return readTableBlock(block.payload).rows.length;
}

/**
 * A chart preview seen as rows.
 *
 * A `chart` block whose visualization is `TABLE` compiles to no view model,
 * which used to draw nothing at all. The rows and the output schema are both
 * in the payload, so the honest fallback is the table the agent asked for.
 * `NUMBER` gets the same treatment when it has more than the one cell.
 */
export function tableFromChartPreview(preview: ChatChartPreview): TableBlockContent {
  const columns = preview.outputSchema.map((column) => ({
    key: column.name,
    label: column.name,
    numeric: column.family === 'NUMBER',
  }));
  const rows = preview.rows.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column.key, row[index] ?? null])),
  );
  return { title: preview.title, columns, rows, footnote: null };
}
