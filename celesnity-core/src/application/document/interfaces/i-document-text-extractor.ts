import type { DocumentExtractionStatus } from '@domain/document/models/document';

export interface ExtractedDocument {
  readonly pages: readonly string[];
  readonly pageCount: number;
  readonly extractionStatus: DocumentExtractionStatus;
}

export interface IDocumentTextExtractor {
  extract(bytes: Uint8Array): Promise<ExtractedDocument>;
}
