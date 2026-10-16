'use client';

import { useState } from 'react';

import { EmptyBlock } from '@/app/_components/ui/empty-state';

import type { FilePreviewContext } from './file-preview.types';
import { PdfFilePreview } from './pdf-file-preview';

export function MediaFilePreview({ context }: { readonly context: FilePreviewContext }) {
  if (context.objectUrl === undefined) {
    return <EmptyBlock title={context.t('chat.workspace.preview.mediaFallback')} />;
  }

  return <MediaElement key={`${context.kind}:${context.objectUrl}`} context={context} />;
}

function MediaElement({ context }: { readonly context: FilePreviewContext }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <EmptyBlock title={context.t('chat.workspace.preview.mediaFallback')} />;
  }

  switch (context.kind) {
    case 'image':
      return (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated Blob URL with unknown dimensions
        <img
          src={context.objectUrl}
          alt={context.path}
          onError={() => setFailed(true)}
          className="max-h-[520px] w-auto max-w-full rounded-lg object-contain"
        />
      );
    case 'pdf':
      return <PdfFilePreview context={context} />;
    case 'audio':
      return (
        <audio
          controls
          preload="metadata"
          onError={() => setFailed(true)}
          src={context.objectUrl}
          className="w-full"
        />
      );
    case 'video':
      return (
        <video
          controls
          preload="metadata"
          onError={() => setFailed(true)}
          src={context.objectUrl}
          className="max-h-[520px] max-w-full rounded-lg"
        />
      );
    default:
      return <EmptyBlock title={context.t('chat.workspace.preview.mediaFallback')} />;
  }
}
