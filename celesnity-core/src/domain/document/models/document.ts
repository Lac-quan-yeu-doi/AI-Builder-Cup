/**
 * `extracted`: at least one page had text. `no_text_found`: the PDF parsed
 * but every page came back empty — almost always a scanned/image-only PDF,
 * which raw-text extraction can't read (see AIP Document Intelligence's own
 * "Raw text ... only available for electronically generated PDFs" caveat;
 * this system doesn't implement OCR, so it surfaces the limitation instead
 * of silently returning nothing).
 */
export type DocumentExtractionStatus = 'extracted' | 'no_text_found';

export type DocumentChartPreview = Readonly<Record<string, unknown>>;

export interface Document {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly storageKey: string;
  /** Extracted text, one entry per PDF page, in page order. */
  readonly pages: readonly string[];
  readonly pageCount: number;
  readonly extractionStatus: DocumentExtractionStatus;
  /** Transient chart payloads referenced by an agent-written report. */
  readonly chartPreviews: readonly DocumentChartPreview[];
  readonly sourceRunId?: string;
  readonly createdAt: string;
}
