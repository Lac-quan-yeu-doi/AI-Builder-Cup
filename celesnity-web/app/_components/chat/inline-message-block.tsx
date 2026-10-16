'use client';

import { extractSuggestions, stripSuggestionTags } from '@/src/entities/models/suggestion';

import type { MessageBlock } from '@/app/_components/chat/types';
import { ArtifactCard } from './artifact-card';
import {
  ARTIFACT_KIND_KEY,
  artifactKindOf,
  artifactTitleOf,
  isArtifactBlock,
} from './message-block-content';
import { useTranslation } from '@/app/_i18n/use-translation';
import { FileTextIcon } from '@/app/_components/ui/icons';
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/app/_components/ui/attachment';
import { ChatMarkdown } from './chat-markdown';
import { ChatSuggestions } from './chat-suggestions';
import { InlineChartPreview } from './inline-chart-preview';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';

interface InlineMessageBlockProps {
  readonly block: MessageBlock;
  /**
   * Renders this block's `<suggestion>` tags as clickable chips when given —
   * omit for anything but the most recent, settled assistant message (see
   * `chat-screen.tsx`), mirroring `AssistantMessageMarkdown`.
   */
  readonly onSuggestionSelect?: (text: string) => void;
  readonly renderer?: ChartRenderer;
  /**
   * Renders chart and table blocks as a card that opens a pane, per the design
   * system's second rule. Absent on surfaces with no stage to open into - a
   * side panel beside a workflow, say - where the block still renders inline.
   */
  readonly onOpenArtifact?: (block: MessageBlock, placement?: 'right') => void;
  readonly artifactOpen?: boolean;
}

export function InlineMessageBlock({
  block,
  onSuggestionSelect,
  renderer,
  onOpenArtifact,
  artifactOpen,
}: InlineMessageBlockProps) {
  /* A chart draws in the transcript, under the sentence that describes it,
     and has a tab on the stage, where it is kept. Tables and documents stay
     one-line cards: a pane is the only place they read well. */
  if (block.blockType === 'chart' && renderer) {
    return (
      <InlineChartPreview
        payload={block.payload}
        fallbackText={block.fallbackText}
        renderer={renderer}
        blockId={block.id}
        {...(onOpenArtifact
          ? { onOpen: () => onOpenArtifact(block), open: artifactOpen === true }
          : {})}
      />
    );
  }

  if (onOpenArtifact && isArtifactBlock(block)) {
    return <BlockArtifactCard block={block} open={artifactOpen === true} onOpen={onOpenArtifact} />;
  }

  switch (block.blockType) {
    case 'table':
      return <TableBlock payload={block.payload} />;
    case 'markdown':
      return <MarkdownBlock payload={block.payload} onSuggestionSelect={onSuggestionSelect} />;
    case 'text':
      return <TextBlock payload={block.payload} onSuggestionSelect={onSuggestionSelect} />;
    case 'file':
      return <FileBlock payload={block.payload} fallback={block.fallbackText} />;
    case 'chart':
      return <FallbackBlock fallback={block.fallbackText} />;
    default:
      return <FallbackBlock fallback={block.fallbackText} />;
  }
}

/**
 * The transcript's entry for one artifact.
 *
 * Titles and row counts are read from the payload here rather than passed in,
 * so the card and the pane cannot drift: both go through
 * `message-block-content`.
 */
export function BlockArtifactCard({
  block,
  open,
  onOpen,
}: {
  readonly block: MessageBlock;
  readonly open: boolean;
  readonly onOpen: (block: MessageBlock, placement?: 'right') => void;
}) {
  const { t } = useTranslation();
  const kind = artifactKindOf(block);
  const kindLabel = t(ARTIFACT_KIND_KEY[kind]);

  return (
    <ArtifactCard
      kind={kind}
      kindLabel={kindLabel}
      onOpen={() => onOpen(block)}
      onSplit={() => onOpen(block, 'right')}
      open={open}
      title={artifactTitleOf(block) ?? kindLabel}
    />
  );
}

function FileBlock({
  payload,
  fallback,
}: {
  readonly payload: Record<string, unknown>;
  readonly fallback: string;
}) {
  const title = firstString(payload, ['filename', 'name', 'title']) ?? fallback;
  const mime = firstString(payload, ['mimeType', 'mime']);
  const size = typeof payload['size'] === 'number' ? formatFileSize(payload['size']) : null;
  const description = [mime, size].filter(Boolean).join(' · ');

  return (
    <Attachment size="sm" className="w-full max-w-sm bg-card">
      <AttachmentMedia>
        <FileTextIcon className="size-5 text-primary" />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{title}</AttachmentTitle>
        {description && <AttachmentDescription>{description}</AttachmentDescription>}
      </AttachmentContent>
    </Attachment>
  );
}

function firstString(payload: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    if (typeof payload[key] === 'string' && payload[key].length > 0) return payload[key];
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TableBlock({ payload }: { readonly payload: Record<string, unknown> }) {
  const { t } = useTranslation();
  const title = typeof payload['title'] === 'string' ? payload['title'] : null;
  const columns = Array.isArray(payload['columns']) ? payload['columns'] : [];
  const rows = Array.isArray(payload['rows']) ? payload['rows'] : [];

  if (columns.length === 0 || rows.length === 0) {
    return <FallbackBlock fallback={t('chat.chart.emptyTable')} />;
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {title && (
        <div className="border-b border-border px-4 py-2.5">
          <h4 className="m-0 text-caption font-semibold text-foreground">{title}</h4>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-caption">
          <thead>
            <tr className="border-b border-border bg-muted">
              {columns.map((col: unknown, i: number) => {
                const c = col as Record<string, unknown>;
                return (
                  <th
                    key={typeof c['key'] === 'string' ? c['key'] : i}
                    className="px-3 py-2 text-left text-caption font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {typeof c['label'] === 'string' ? c['label'] : String(c['key'] ?? '')}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: unknown, rowIdx: number) => {
              const r = row as Record<string, unknown>;
              return (
                <tr
                  key={rowIdx}
                  className="border-b border-border last:border-b-0 hover:bg-muted/50"
                >
                  {columns.map((col: unknown, colIdx: number) => {
                    const c = col as Record<string, unknown>;
                    const key = typeof c['key'] === 'string' ? c['key'] : '';
                    const value = r[key];
                    return (
                      <td key={colIdx} className="px-3 py-2 text-foreground tabular-nums">
                        {formatCellValue(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {typeof payload['footnote'] === 'string' && (
        <div className="border-t border-border px-4 py-2">
          <p className="m-0 text-caption text-muted-foreground">{payload['footnote']}</p>
        </div>
      )}
    </div>
  );
}

function MarkdownBlock({
  payload,
  onSuggestionSelect,
}: {
  readonly payload: Record<string, unknown>;
  readonly onSuggestionSelect?: (text: string) => void;
}) {
  const content = typeof payload['content'] === 'string' ? payload['content'] : '';
  // Parsed even when no chips are offered — see `assistant-message-markdown`.
  const suggestions = extractSuggestions(content);
  const displayContent =
    suggestions.length > 0
      ? stripSuggestionTags(content, onSuggestionSelect !== undefined)
      : content;
  return (
    <div className="text-body-md leading-[1.65] text-foreground">
      <ChatMarkdown content={displayContent} />
      {onSuggestionSelect && (
        <ChatSuggestions suggestions={suggestions} onSelect={onSuggestionSelect} />
      )}
    </div>
  );
}

function TextBlock({
  payload,
  onSuggestionSelect,
}: {
  readonly payload: Record<string, unknown>;
  readonly onSuggestionSelect?: (text: string) => void;
}) {
  const text = typeof payload['text'] === 'string' ? payload['text'] : '';
  // Parsed even when no chips are offered — see `assistant-message-markdown`.
  const suggestions = extractSuggestions(text);
  const displayText =
    suggestions.length > 0 ? stripSuggestionTags(text, onSuggestionSelect !== undefined) : text;
  return (
    <div className="text-body-md leading-[1.65] whitespace-pre-wrap text-foreground">
      {displayText}
      {onSuggestionSelect && (
        <ChatSuggestions suggestions={suggestions} onSelect={onSuggestionSelect} />
      )}
    </div>
  );
}

function FallbackBlock({ fallback }: { readonly fallback: string }) {
  return <div className="text-caption leading-[1.6] text-muted-foreground italic">{fallback}</div>;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  return String(value);
}
