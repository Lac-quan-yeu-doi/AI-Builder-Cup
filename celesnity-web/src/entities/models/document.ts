export type DocumentExtractionStatus = 'extracted' | 'no_text_found';

export type DocumentChartPreview = Readonly<Record<string, unknown>>;

export interface Document {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly pageCount: number;
  readonly extractionStatus: DocumentExtractionStatus;
  readonly chartPreviews: readonly DocumentChartPreview[];
  readonly createdAt: string;
}

export interface DocumentText {
  readonly documentId: string;
  readonly pageCount: number;
  readonly extractionStatus: DocumentExtractionStatus;
  readonly text: string;
  readonly chartPreviews: readonly DocumentChartPreview[];
}

export type DocumentContent =
  | { readonly kind: 'text'; readonly content: DocumentText }
  | { readonly kind: 'file'; readonly blob: Blob };
