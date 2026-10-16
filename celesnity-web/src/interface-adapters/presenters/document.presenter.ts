import type { Document } from '@/src/entities/models/document';

export interface DocumentViewModel {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly pageCount: number;
  readonly extractionStatus: 'extracted' | 'no_text_found';
  readonly chartPreviews: Document['chartPreviews'];
  readonly createdAt: string;
}

export function presentDocument(document: Document): DocumentViewModel {
  return {
    id: document.id,
    filename: document.filename,
    mimeType: document.mimeType,
    pageCount: document.pageCount,
    extractionStatus: document.extractionStatus,
    chartPreviews: document.chartPreviews,
    createdAt: document.createdAt,
  };
}
