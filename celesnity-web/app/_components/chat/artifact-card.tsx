'use client';

import { ChartColumnIcon, Columns2Icon, FileTextIcon, Table2Icon } from 'lucide-react';

import { IconButton } from '@/app/_components/ui/icon-button';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';

export type ArtifactCardKind = 'chart' | 'table' | 'document';

interface ArtifactCardProps {
  readonly kind: ArtifactCardKind;
  readonly title: string;
  /** The kind as one quiet word — "Chart", "Table" — and nothing else. */
  readonly kindLabel: string;
  /** Whether this artifact currently has a pane on the stage. */
  readonly open: boolean;
  readonly onOpen: () => void;
  /** Absent when the surface has no stage to split, such as a side panel. */
  readonly onSplit?: () => void;
}

const ICON = { chart: ChartColumnIcon, table: Table2Icon, document: FileTextIcon } as const;

/**
 * What an answer's chart or table looks like in the transcript.
 *
 * The design system's second rule is that artefacts are cards first and panes
 * second, so the transcript stays the index of everything the conversation
 * made. Before this, a chart rendered inline at full column width and stayed
 * there: scrolling past it was how you lost it, and the only way back was to
 * scroll until you found it again.
 *
 * The shape is the design system's `.artifactCard`
 * (`app/design-system/chat/workspace.module.css:105`): **one row at the height
 * of one line of text** — a bare icon, the title, the kind as a quiet suffix,
 * and the split control on hover. This sits directly on the thread, so its
 * border is the only frame around it, which is why the assistant turn has none
 * of its own.
 *
 * Two things it deliberately does not carry. A second line of metadata: the
 * row count lives on the pane's source bar, where the data is. And any text
 * about being open — whether it is already on the stage is the card's own
 * border and tint, because a word repeated on every open card is a word nobody
 * reads twice.
 */
export function ArtifactCard({ kind, title, kindLabel, open, onOpen, onSplit }: ArtifactCardProps) {
  const { t } = useTranslation();
  const Icon = ICON[kind];

  return (
    <div
      className={cn(
        'group/artifact flex h-9 w-fit max-w-full items-center gap-2 rounded-md border ps-2.5 pe-1.5 transition-colors',
        open
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-background hover:border-foreground/20 hover:bg-muted',
      )}
    >
      <button
        data-tutorial-target={`chat-artifact-${kind}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
        onClick={onOpen}
        type="button"
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-caption font-medium text-foreground">{title}</span>
        <span className="shrink-0 text-caption text-muted-foreground">{kindLabel}</span>
      </button>

      {onSplit ? (
        <IconButton
          className="opacity-0 transition-opacity group-focus-within/artifact:opacity-100 group-hover/artifact:opacity-100"
          label={t('chat.artifact.openRight')}
          onClick={onSplit}
          size="xs"
          variant="ghost"
        >
          <Columns2Icon />
        </IconButton>
      ) : null}
    </div>
  );
}
