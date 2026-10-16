'use client';

import { useState, type RefObject } from 'react';
import { DownloadIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { useTranslation } from '@/app/_i18n/use-translation';

interface ReportPdfExportButtonProps {
  readonly contentRef: RefObject<HTMLElement | null>;
  readonly filename: string;
}

const PDF_CONTENT_WIDTH = '688px';

export function ReportPdfExportButton({ contentRef, filename }: ReportPdfExportButtonProps) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(false);

  async function downloadPdf() {
    const content = contentRef.current;
    if (!content || exporting) return;

    setExporting(true);
    setError(false);
    try {
      const { default: html2pdf } = await import('html2pdf.js');
      const options = {
        margin: [0.55, 0.55, 0.65, 0.55] as [number, number, number, number],
        filename: pdfFilename(filename),
        image: { type: 'jpeg' as const, quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { compressPDF: true, format: 'a4', orientation: 'portrait' as const, unit: 'in' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.break-inside-avoid'] },
      };

      const restorePdfLayout = expandForPdf(content);
      try {
        await waitForPdfLayout();
        await html2pdf().set(options).from(content).save();
      } finally {
        restorePdfLayout();
      }
    } catch {
      setError(true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="xs"
        variant="outline"
        onClick={() => void downloadPdf()}
        disabled={exporting}
        aria-busy={exporting}
      >
        <DownloadIcon />
        {exporting ? t('documents.exportingPdf') : t('documents.downloadPdf')}
      </Button>
      {error ? (
        <span className="text-xs text-destructive" role="status">
          {t('documents.pdfExportError')}
        </span>
      ) : null}
    </span>
  );
}

function expandForPdf(content: HTMLElement): () => void {
  const original = {
    width: content.style.width,
    maxWidth: content.style.maxWidth,
    minWidth: content.style.minWidth,
  };
  content.style.width = PDF_CONTENT_WIDTH;
  content.style.maxWidth = 'none';
  content.style.minWidth = '0';

  return () => {
    content.style.width = original.width;
    content.style.maxWidth = original.maxWidth;
    content.style.minWidth = original.minWidth;
  };
}

async function waitForPdfLayout(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function pdfFilename(filename: string): string {
  const base = filename
    .replace(/\.[^./]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'report'}.pdf`;
}
