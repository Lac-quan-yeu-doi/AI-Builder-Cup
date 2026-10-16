'use client';

import { useEffect, useState } from 'react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { FilePreviewBody } from '@/app/_components/chat/file-preview/file-preview-body';
import {
  isPreviewOverLimit,
  previewPolicyFor,
} from '@/app/_components/chat/file-preview/file-preview-policy';
import type { FilePreviewContext } from '@/app/_components/chat/file-preview/file-preview.types';

interface Props {
  readonly filename: string;
  readonly mimeType: string;
  readonly blob: Blob;
}

type ViewerState = { readonly context: FilePreviewContext; readonly downloadUrl: string };

export function DocumentFileViewer({ filename, mimeType, blob }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<ViewerState | null>(null);

  useEffect(() => {
    let active = true;
    const objectUrl = URL.createObjectURL(blob);
    const policy = previewPolicyFor(filename, mimeType);
    void (async () => {
      const text =
        !isPreviewOverLimit(policy, blob.size) &&
        ['text', 'markdown', 'json', 'table', 'source-only'].includes(policy.kind)
          ? await blob.text()
          : undefined;
      if (!active) return;
      const kind = isPreviewOverLimit(policy, blob.size) ? 'binary' : policy.kind;
      setState({
        context: {
          path: filename,
          fileName: filename,
          kind,
          ...(policy.language === undefined ? {} : { language: policy.language }),
          ...(text === undefined ? {} : { text }),
          blob,
          ...(['image', 'pdf', 'audio', 'video'].includes(kind) ? { objectUrl } : {}),
          t,
        },
        downloadUrl: objectUrl,
      });
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blob, filename, mimeType, t]);

  if (!state) return <p className="text-sm text-muted-foreground">{t('documents.loadingText')}</p>;
  return (
    <div className="flex h-full min-h-[24rem] flex-col gap-2">
      <a
        href={state.downloadUrl}
        download={filename}
        className="self-end text-sm text-primary underline"
      >
        {t('documents.downloadFile')}
      </a>
      <div className="min-h-0 flex-1 overflow-auto">
        <FilePreviewBody context={state.context} />
      </div>
    </div>
  );
}
