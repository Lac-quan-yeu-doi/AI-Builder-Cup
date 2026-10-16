'use client';

import { DownloadIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { TranslationKey } from '@/app/_i18n/en';
import type { Translator } from '@/app/_i18n/translate';
import { ArrowLeftIcon } from '@/app/_components/ui/icons';
import { Button } from '@/app/_components/ui/button';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { Spinner } from '@/app/_components/ui/spinner';
import { FilePreviewBody } from '@/app/_components/chat/file-preview/file-preview-body';
import {
  isPreviewOverLimit,
  previewPolicyFor,
} from '@/app/_components/chat/file-preview/file-preview-policy';
import type { FilePreviewContext } from '@/app/_components/chat/file-preview/file-preview.types';
import { NotFoundError } from '@/src/entities/errors/application-errors';
import type { RunFileContent, RunFileEntry } from '@/src/entities/models/chat';

type ViewerState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly data: RunFileContent }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly message: string };

function isTextPreviewKind(kind: FilePreviewContext['kind']): boolean {
  return (
    kind === 'text' ||
    kind === 'markdown' ||
    kind === 'json' ||
    kind === 'table' ||
    kind === 'source-only'
  );
}

function isMediaPreviewKind(kind: FilePreviewContext['kind']): boolean {
  return kind === 'image' || kind === 'pdf' || kind === 'audio' || kind === 'video';
}

const PREVIEW_TYPE_LABEL_KEYS: Record<FilePreviewContext['kind'], TranslationKey> = {
  text: 'chat.workspace.preview.type.text',
  markdown: 'chat.workspace.preview.type.markdown',
  json: 'chat.workspace.preview.type.json',
  table: 'chat.workspace.preview.type.table',
  image: 'chat.workspace.preview.type.image',
  pdf: 'chat.workspace.preview.type.pdf',
  audio: 'chat.workspace.preview.type.audio',
  video: 'chat.workspace.preview.type.video',
  'source-only': 'chat.workspace.preview.type.source',
  binary: 'chat.workspace.preview.type.binary',
};

type ViewerSnapshot = {
  readonly key: string;
  readonly state: ViewerState;
  readonly preview: FilePreviewContext | null;
  readonly downloadOnly: 'tooLarge' | 'binary' | null;
};

export interface RunFileViewerProps {
  readonly runId: string;
  readonly entry: RunFileEntry;
  readonly getRunFileContent: (runId: string, path: string) => Promise<RunFileContent>;
  readonly onBack: () => void;
  readonly t: Translator;
}

/**
 * Shows one run file's content, chosen by MIME + size. The size gate runs
 * BEFORE fetching: a `RunFileEntry` whose `sizeBytes` exceeds the 2 MB inline
 * cap is rendered download-only without ever pulling the blob into the browser
 * (the fetch only happens if the viewer downloads on click). Otherwise the
 * blob is fetched on mount and rendered as Monaco text, an inline image, an
 * embedded PDF, or — for anything else or a post-fetch over-cap surprise — a
 * download-only note. Every object URL created for the image/PDF branches is
 * revoked on unmount and before a new one replaces it.
 */
export function RunFileViewer({ runId, entry, getRunFileContent, onBack, t }: RunFileViewerProps) {
  const { path } = entry;
  const contentVersion = entry.accessedAt;
  const entryPolicy = previewPolicyFor(path, entry.mimeType);
  const entryBinaryOnly =
    entryPolicy.kind === 'binary' && (entry.sizeBytes === undefined || entry.sizeBytes === 0);
  const entryOverCap =
    entryPolicy.kind === 'binary'
      ? entry.sizeBytes !== undefined && entry.sizeBytes > 0
      : isPreviewOverLimit(entryPolicy, entry.sizeBytes);

  const contentKey = `${runId}:${path}:${contentVersion}`;
  const [snapshot, setSnapshot] = useState<ViewerSnapshot>({
    key: '',
    state: { status: 'idle' },
    preview: null,
    downloadOnly: null,
  });
  const currentSnapshot = snapshot.key === contentKey ? snapshot : null;
  const state: ViewerState =
    currentSnapshot?.state ??
    (entryBinaryOnly || entryOverCap ? { status: 'idle' } : { status: 'loading' });
  const preview = currentSnapshot?.preview ?? null;
  const downloadOnly =
    currentSnapshot?.state.status === 'error'
      ? null
      : entryBinaryOnly
        ? 'binary'
        : entryOverCap
          ? 'tooLarge'
          : (currentSnapshot?.downloadOnly ?? null);
  const displayedPreviewKind = preview?.kind ?? entryPolicy.kind;
  // The object URL currently backing an image/PDF/media element, so it can be
  // revoked on unmount or before a replacement is created.
  const objectUrlRef = useRef<string | null>(null);
  // Blobs already in hand — reused by Download so an over-cap file is fetched
  // at most once, on the first download click.
  const blobRef = useRef<Blob | null>(null);
  const fileNameRef = useRef<string>(path.slice(path.lastIndexOf('/') + 1));

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current !== null) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // Fetch + classify on mount and whenever the entry metadata changes. Known
  // binary or over-limit files skip the fetch entirely.
  useEffect(() => {
    if (entryBinaryOnly || entryOverCap) return;

    let active = true;
    blobRef.current = null;
    fileNameRef.current = path.slice(path.lastIndexOf('/') + 1);
    revokeObjectUrl();

    getRunFileContent(runId, path)
      .then(async (data) => {
        if (!active) return;
        blobRef.current = data.blob;
        fileNameRef.current = data.fileName;

        const policy = previewPolicyFor(path, data.mimeType);
        const sizeBytes = Math.max(data.sizeBytes, data.blob.size);
        if (isPreviewOverLimit(policy, sizeBytes)) {
          setSnapshot({
            key: contentKey,
            state: { status: 'loaded', data },
            preview: null,
            downloadOnly: 'tooLarge',
          });
          return;
        }
        if (policy.kind === 'binary') {
          setSnapshot({
            key: contentKey,
            state: { status: 'loaded', data },
            preview: null,
            downloadOnly: 'binary',
          });
          return;
        }

        let text: string | undefined;
        let objectUrl: string | undefined;
        if (isTextPreviewKind(policy.kind)) {
          text = await data.blob.text();
          if (!active) return;
        } else if (isMediaPreviewKind(policy.kind)) {
          objectUrl = URL.createObjectURL(data.blob);
          objectUrlRef.current = objectUrl;
        }

        const nextPreview: FilePreviewContext = {
          path,
          fileName: data.fileName,
          kind: policy.kind,
          ...(policy.language === undefined ? {} : { language: policy.language }),
          ...(text === undefined ? {} : { text }),
          blob: data.blob,
          ...(objectUrl === undefined ? {} : { objectUrl }),
          t,
        };
        setSnapshot({
          key: contentKey,
          state: { status: 'loaded', data },
          preview: nextPreview,
          downloadOnly: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSnapshot({
          key: contentKey,
          state:
            error instanceof NotFoundError
              ? { status: 'not-found' }
              : {
                  status: 'error',
                  message: error instanceof Error ? error.message : String(error),
                },
          preview: null,
          downloadOnly: null,
        });
      });

    return () => {
      active = false;
    };
  }, [
    contentKey,
    entryBinaryOnly,
    entryOverCap,
    getRunFileContent,
    path,
    revokeObjectUrl,
    runId,
    t,
  ]);

  // Revoke any live object URL when the viewer unmounts.
  useEffect(() => revokeObjectUrl, [revokeObjectUrl]);

  const triggerDownload = useCallback((blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const onDownload = useCallback(() => {
    if (blobRef.current !== null) {
      triggerDownload(blobRef.current, fileNameRef.current);
      return;
    }
    // Over-cap (or not-yet-loaded) file: fetch it now, only for the download.
    getRunFileContent(runId, path)
      .then((data) => {
        blobRef.current = data.blob;
        fileNameRef.current = data.fileName;
        triggerDownload(data.blob, data.fileName);
      })
      .catch(() => {
        setSnapshot({
          key: contentKey,
          state: { status: 'error', message: t('chat.runInspector.files.loadError') },
          preview: null,
          downloadOnly: null,
        });
      });
  }, [contentKey, getRunFileContent, runId, path, triggerDownload, t]);

  return (
    <div className="flex min-h-0 flex-col gap-4 h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button size="sm" variant="outline" onClick={onBack}>
            <ArrowLeftIcon size={16} />
            {t('chat.runInspector.files.back')}
          </Button>
          <div className="hidden h-7 w-px bg-border sm:block" />
          <p className="m-0 min-w-0 truncate font-mono text-caption font-medium text-foreground">
            {path.slice(path.lastIndexOf('/') + 1)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onDownload}>
          <DownloadIcon className="size-3.5" />
          {t('chat.runInspector.files.download')}
        </Button>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/70 bg-muted/35 px-3 py-2.5">
        <span className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">
          {path}
        </span>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-micro font-semibold tracking-wide text-primary uppercase">
          {t(PREVIEW_TYPE_LABEL_KEYS[displayedPreviewKind])}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm sm:p-5">
        <Body downloadOnly={downloadOnly} state={state} preview={preview} t={t} />
      </div>
    </div>
  );
}

function Body({
  downloadOnly,
  state,
  preview,
  t,
}: {
  readonly downloadOnly: 'tooLarge' | 'binary' | null;
  readonly state: ViewerState;
  readonly preview: FilePreviewContext | null;
  readonly t: Translator;
}) {
  if (downloadOnly === 'binary') {
    return <EmptyBlock title={t('chat.runInspector.files.binary')} />;
  }
  if (downloadOnly === 'tooLarge') {
    return <EmptyBlock title={t('chat.runInspector.files.tooLarge')} />;
  }
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-3.5" />
        {t('chat.runInspector.loading')}
      </div>
    );
  }
  if (state.status === 'not-found') {
    return <p className="text-xs text-muted-foreground">{t('chat.runInspector.notFound')}</p>;
  }
  if (state.status === 'error') {
    return <p className="text-xs text-destructive">{state.message}</p>;
  }
  if (preview === null) {
    return <EmptyBlock title={t('chat.runInspector.files.binary')} />;
  }
  return <FilePreviewBody context={preview} />;
}
