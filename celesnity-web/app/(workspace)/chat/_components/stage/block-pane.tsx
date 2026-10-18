'use client';

import { useMemo, useState } from 'react';

import { ChartView } from '@/app/_components/shared/chart-view';
import { readChartView, readTableContent } from '@/app/_components/chat/artifact-reading';
import { ArtifactSourceBar } from '@/app/_components/chat/artifact-source-bar';
import { ArtifactKeep, type KeptChart } from '@/app/_components/chat/artifact-keep';
import { chartSource, type ArtifactSource } from '@/app/_components/chat/artifact-source';
import { BlockTableView } from '@/app/_components/chat/block-table-view';
import {
  readChartBlock,
  readTableBlock,
  tableFromChartPreview,
} from '@/app/_components/chat/message-block-content';
import type { MessageBlock } from '@/app/_components/chat/types';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import type { ListChartCollectionsController } from '@/src/interface-adapters/controllers/chart-collections/list-chart-collections.controller';
import type { SaveChatChartPreviewController } from '@/src/interface-adapters/controllers/canonical-charts/save-chat-chart-preview.controller';

export interface BlockPaneProps {
  readonly block: MessageBlock;
  readonly renderer?: ChartRenderer;
  /** The question this artifact answers, carried onto a kept chart. */
  readonly question?: string | null;
  /** Present once this artifact has been kept in Our analytics. */
  readonly kept?: KeptChart;
  readonly onKept?: (kept: KeptChart) => void;
  /** Both are needed to offer Keep; absent on a surface that cannot save. */
  readonly listCollections?: ListChartCollectionsController;
  readonly saveChatPreview?: SaveChatChartPreviewController;
}

/**
 * One answer, on the stage.
 *
 * Three parts in a fixed order, which is what makes two artifacts comparable:
 * a sentence reading the data, the drawing or the rows, and a bar naming where
 * it came from. The sentence is at the top because it is the answer; the source
 * is pinned at the bottom because provenance that scrolls away is provenance
 * nobody checks.
 */
export function BlockPane(props: BlockPaneProps) {
  if (props.block.blockType === 'document') return <PaneNotice text={props.block.fallbackText} />;

  return props.block.blockType === 'chart' ? (
    <ChartBlockPane {...props} />
  ) : (
    <TableBlockPane block={props.block} />
  );
}

function ChartBlockPane({
  block,
  renderer,
  question,
  kept,
  onKept,
  listCollections,
  saveChatPreview,
}: BlockPaneProps) {
  const { locale, t } = useTranslation();
  const [sqlOpen, setSqlOpen] = useState(false);
  const preview = useMemo(() => readChartBlock(block.payload), [block.payload]);

  const view = useMemo(
    () =>
      preview && renderer
        ? renderer.compile(preview.visualizationDefinition, preview.outputSchema, preview.rows)
        : null,
    [preview, renderer],
  );

  if (preview === null) {
    return <PaneNotice text={block.fallbackText} />;
  }

  const partial = preview.truncated || preview.displayTruncated;
  const reading = view === null ? null : readChartView(view, locale, partial);
  const source = chartSource(
    preview.queryDefinition,
    preview.rows.length,
    preview.rowCount,
    partial,
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <PaneReading text={reading === null ? preview.description : t(reading.key, reading.params)} />

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {preview.rows.length === 0 ? (
          <EmptyBlock title={t('chat.artifact.empty')} />
        ) : view !== null ? (
          <div className="h-[clamp(200px,42vh,420px)] w-full">
            <ChartView ariaLabel={preview.title} view={view} />
          </div>
        ) : (
          /* TABLE and NUMBER visualizations compile to no view model. The rows
             are in the payload either way, so they are what gets drawn. */
          <BlockTableView content={tableFromChartPreview(preview)} />
        )}
      </div>

      <ArtifactSourceBar
        onToggle={() => setSqlOpen((open) => !open)}
        open={sqlOpen}
        source={source}
        {...(listCollections && saveChatPreview && onKept
          ? {
              trailing: (
                <ArtifactKeep
                  kept={kept}
                  listCollections={listCollections}
                  onKept={onKept}
                  preview={preview}
                  question={question ?? null}
                  saveChatPreview={saveChatPreview}
                />
              ),
            }
          : {})}
      />
    </div>
  );
}

function TableBlockPane({ block }: { readonly block: MessageBlock }) {
  const { locale, t } = useTranslation();
  const content = useMemo(() => readTableBlock(block.payload), [block.payload]);
  const reading = readTableContent(content, locale, false);

  const source: ArtifactSource = {
    /* A table block carries no query definition, so the most this can name is
       the block's own title. Nothing is invented to fill the bar. */
    label: content.title ?? t('chat.pane.kind.table'),
    sql: null,
    shownRows: content.rows.length,
    totalRows: content.rows.length,
    truncated: false,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <PaneReading text={reading === null ? content.footnote : t(reading.key, reading.params)} />

      {content.rows.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
          <EmptyBlock title={t('chat.artifact.empty')} />
        </div>
      ) : (
        <BlockTableView content={content} scrollable />
      )}

      <ArtifactSourceBar onToggle={() => undefined} open={false} source={source} />
    </div>
  );
}

function PaneReading({ text }: { readonly text: string | null }) {
  if (text === null || text === '') return null;
  return (
    <p className="m-0 shrink-0 px-4 pt-3 pb-1 text-body-sm leading-[1.5] text-foreground">{text}</p>
  );
}

function PaneNotice({ text }: { readonly text: string }) {
  return <p className="m-0 p-4 text-caption leading-[1.6] text-muted-foreground italic">{text}</p>;
}
