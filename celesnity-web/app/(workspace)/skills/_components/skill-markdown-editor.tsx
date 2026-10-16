'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { AtomicCodeMirrorEditor, type AtomicCodeMirrorEditorHandle } from '@atomic-editor/editor';

import { FieldBlock } from '@/app/_components/ui/fields';
import { FieldTitle } from '@/app/_components/ui/field';
import { cn } from '@/app/_components/ui/utils';

export interface SkillMarkdownEditorProps {
  readonly body: string;
  readonly documentId: string;
  readonly editable: boolean;
  readonly busy?: boolean;
  readonly label: string;
  readonly formatLabel: string;
  readonly statsLabel: string;
  readonly hint: string;
  readonly onChange: (body: string) => void;
}

const editorTokens = {
  '--atomic-editor-fg': 'var(--color-foreground)',
  '--atomic-editor-fg-muted': 'var(--color-muted-foreground)',
  '--atomic-editor-fg-faint': 'var(--color-muted-foreground)',
  '--atomic-editor-bg': 'var(--color-card)',
  '--atomic-editor-bg-panel': 'var(--color-muted)',
  '--atomic-editor-bg-surface': 'var(--color-background)',
  '--atomic-editor-border': 'var(--color-border)',
  '--atomic-editor-accent': 'var(--color-primary)',
  '--atomic-editor-accent-bright': 'var(--color-primary)',
  '--atomic-editor-accent-soft': 'color-mix(in srgb, var(--color-primary) 18%, transparent)',
  '--atomic-editor-link': 'var(--color-primary)',
  '--atomic-editor-link-hover': 'var(--color-primary)',
  '--atomic-editor-code-bg': 'var(--color-muted)',
  '--atomic-editor-selection-bg': 'color-mix(in srgb, var(--color-primary) 18%, transparent)',
  '--atomic-editor-search-bg': 'color-mix(in srgb, var(--color-primary) 18%, transparent)',
  '--atomic-editor-search-bg-active': 'color-mix(in srgb, var(--color-primary) 30%, transparent)',
} as CSSProperties;

export function SkillMarkdownEditor({
  body,
  documentId,
  editable,
  busy = false,
  label,
  formatLabel,
  statsLabel,
  hint,
  onChange,
}: SkillMarkdownEditorProps) {
  const editorHandleRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);
  const readOnly = !editable || busy;

  useEffect(() => {
    const content = editorHandleRef.current?.getContentDOM();
    if (!content) return;
    content.setAttribute('aria-label', label);
  }, [documentId, label]);

  return (
    <FieldBlock className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5" hint={hint}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <FieldTitle>{label}</FieldTitle>
        <div
          data-skill-body-stats
          className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
        >
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-medium">
            {formatLabel}
          </span>
          <span className="truncate">{statsLabel}</span>
        </div>
      </div>
      <div
        className={cn(
          'min-h-48 min-w-0 flex-1 overflow-hidden rounded-md border border-input bg-card',
          busy && 'opacity-60',
        )}
        data-editor="atomic"
        data-read-only={readOnly || undefined}
        data-theme="light"
        style={editorTokens}
      >
        <AtomicCodeMirrorEditor
          documentId={documentId}
          markdownSource={body}
          onMarkdownChange={onChange}
          onLinkClick={openSafeSkillLink}
          editorHandleRef={editorHandleRef}
          readOnly={readOnly}
        />
      </div>
    </FieldBlock>
  );
}

function openSafeSkillLink(url: string): void {
  if (!/^(?:https?:|mailto:)/iu.test(url)) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
