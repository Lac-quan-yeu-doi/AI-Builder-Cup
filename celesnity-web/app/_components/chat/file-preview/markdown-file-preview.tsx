'use client';

import { AtomicCodeMirrorEditor } from '@atomic-editor/editor';
import type { CSSProperties } from 'react';

import { rewriteCitationTags } from '@/src/entities/models/citation';

import type { FilePreviewContext } from './file-preview.types';

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

export function MarkdownFilePreview({ context }: { readonly context: FilePreviewContext }) {
  return (
    <div
      className="h-[420px] min-h-0 overflow-hidden"
      data-editor="atomic"
      data-read-only="true"
      data-theme="light"
      style={editorTokens}
    >
      <AtomicCodeMirrorEditor
        markdownSource={rewriteCitationTags(context.text ?? '')}
        onLinkClick={openSafeMarkdownLink}
        readOnly
      />
    </div>
  );
}

function openSafeMarkdownLink(url: string): void {
  if (!/^(?:https?:|mailto:)/iu.test(url)) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
