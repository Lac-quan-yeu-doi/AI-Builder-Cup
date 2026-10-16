'use client';

import Editor from '@monaco-editor/react';

import { EmptyBlock } from '@/app/_components/ui/empty-state';

import { DelimitedFilePreview } from './delimited-file-preview';
import { JsonFilePreview } from './json-file-preview';
import { MarkdownFilePreview } from './markdown-file-preview';
import { MediaFilePreview } from './media-file-preview';
import type { FilePreviewContext } from './file-preview.types';

export interface FilePreviewBodyProps {
  readonly context: FilePreviewContext;
}

export function FilePreviewBody({ context }: FilePreviewBodyProps) {
  switch (context.kind) {
    case 'markdown':
      return <MarkdownFilePreview context={context} />;
    case 'json':
      return <JsonFilePreview context={context} />;
    case 'table':
      return <DelimitedFilePreview context={context} />;
    case 'image':
    case 'pdf':
    case 'audio':
    case 'video':
      return <MediaFilePreview context={context} />;
    case 'text':
    case 'source-only':
      return <SourcePreview context={context} />;
    case 'binary':
      return <EmptyBlock title={context.t('chat.runInspector.files.binary')} />;
  }
}

function SourcePreview({ context }: { readonly context: FilePreviewContext }) {
  return (
    <div className="flex flex-col gap-2">
      {context.kind === 'source-only' && (
        <p className="m-0 text-xs text-muted-foreground">
          {context.t('chat.workspace.preview.sourceOnly')}
        </p>
      )}
      <div className="h-[420px] bg-editor-canvas">
        <Editor
          height="100%"
          language={context.language ?? 'plaintext'}
          theme="vs-dark"
          value={context.text ?? ''}
          options={{
            ariaLabel: context.t('chat.workspace.preview.sourceLabel', {
              language: context.language ?? 'plaintext',
            }),
            automaticLayout: true,
            minimap: { enabled: false },
            padding: { top: 16, bottom: 16 },
            readOnly: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  );
}
