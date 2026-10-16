'use client';

import { useEffect, useRef, useState } from 'react';

import { EmptyBlock } from '@/app/_components/ui/empty-state';
import type { FilePreviewContext } from './file-preview.types';

export function PdfFilePreview({ context }: { readonly context: FilePreviewContext }) {
  const { blob, fileName, t } = context;
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!blob) {
      return;
    }

    let active = true;
    let loadingTask: import('pdfjs-dist/legacy/build/pdf.mjs').PDFDocumentLoadingTask | undefined;

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        const data = await blob.arrayBuffer();
        if (!active) return;
        loadingTask = pdfjs.getDocument({ data });
        const pdf = await loadingTask.promise;
        const container = containerRef.current;
        if (!active || !container) return;

        const pixelRatio = window.devicePixelRatio || 1;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (!active) return;
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(
            (container.clientWidth || baseViewport.width) / baseViewport.width,
            2,
          );
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.setAttribute(
            'aria-label',
            t('metadataExplorer.page', { page: pageNumber, totalPages: pdf.numPages }),
          );
          canvas.setAttribute('role', 'img');
          canvas.className = 'mx-auto block max-w-full rounded border border-border bg-white';
          canvas.width = Math.floor(viewport.width * pixelRatio);
          canvas.height = Math.floor(viewport.height * pixelRatio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const canvasContext = canvas.getContext('2d');
          if (!canvasContext) throw new Error('Canvas rendering is unavailable');
          canvasContext.scale(pixelRatio, pixelRatio);
          await page.render({ canvasContext, viewport }).promise;
          if (active) container.append(canvas);
        }
        if (active) setLoading(false);
      } catch {
        if (active) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [blob, fileName, t]);

  if (failed || !blob) return <EmptyBlock title={t('chat.workspace.preview.mediaFallback')} />;

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={fileName}
      aria-busy={loading}
      className="flex flex-col gap-3"
    />
  );
}
