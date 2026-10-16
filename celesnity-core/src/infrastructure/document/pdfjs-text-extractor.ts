import { Injectable, Optional } from '@nestjs/common';

import type {
  ExtractedDocument,
  IDocumentTextExtractor,
} from '@application/document/interfaces/i-document-text-extractor';

// Only the slice of pdfjs-dist's API this extractor calls — kept narrow and
// hand-written (rather than importing pdfjs-dist's own types) so the
// loader can be swapped for a fake in tests without pulling in the real,
// ESM-only module (see the class doc comment for why that matters).
export interface PdfjsTextItem {
  readonly str?: string;
}
export interface PdfjsTextContent {
  readonly items: readonly PdfjsTextItem[];
}
export interface PdfjsPage {
  getTextContent(): Promise<PdfjsTextContent>;
}
export interface PdfjsDocument {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfjsPage>;
}
export interface PdfjsLoadingTask {
  readonly promise: Promise<PdfjsDocument>;
  destroy(): Promise<void>;
}
export type PdfjsModule = {
  getDocument(params: {
    data: Uint8Array;
    useWorkerFetch: boolean;
    useSystemFonts: boolean;
  }): PdfjsLoadingTask;
};
export type PdfjsModuleLoader = () => Promise<PdfjsModule>;

const defaultLoader: PdfjsModuleLoader = () =>
  // The local port intentionally excludes marked-content variants that this
  // raw-text adapter ignores, so bridge the wider upstream module at the edge.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as Promise<PdfjsModule>;

/**
 * Raw-text extraction only — the cheapest of AIP Document Intelligence's
 * extraction tiers ("Raw text: extracts text by reading document metadata.
 * Only available for electronically generated PDFs."). No OCR/VLM: a
 * scanned PDF comes back with `extractionStatus: 'no_text_found'` rather
 * than a wrong or empty-but-unexplained result.
 *
 * `pdfjs-dist`'s Node-compatible build is ESM-only; this project compiles
 * to CommonJS, and Jest's CommonJS runtime can't execute a real dynamic
 * `import()` of it (it tries to parse the `.mjs` file itself rather than
 * deferring to Node's ESM loader, and fails on `import.meta`). So the
 * module load is injected (`loadPdfjs`), defaulting to the real one in
 * production; tests supply a fake to cover this class's own page-iteration
 * and status logic. Real end-to-end extraction is verified out of band —
 * this is the same category as this project's Docker/MinIO/Trino-backed
 * adapters (see `jest.config.ts`'s coverage-threshold comment), not a gap
 * specific to this file.
 */
@Injectable()
export class PdfjsTextExtractor implements IDocumentTextExtractor {
  // `@Optional()` so Nest's DI (which otherwise tries to resolve every
  // constructor parameter against a provider) passes `undefined` here
  // instead of throwing — this parameter exists for tests, not DI.
  public constructor(@Optional() private readonly loadPdfjs?: PdfjsModuleLoader) {}

  public async extract(bytes: Uint8Array): Promise<ExtractedDocument> {
    const loader = this.loadPdfjs ?? defaultLoader;
    const pdfjsModule = await loader();

    const loadingTask = pdfjsModule.getDocument({
      // PDF.js rejects Node Buffer even though it subclasses Uint8Array.
      data: Uint8Array.from(bytes),
      useWorkerFetch: false,
      useSystemFonts: true,
    });

    try {
      const pdf = await loadingTask.promise;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => item.str ?? '')
          .join(' ')
          .trim();
        pages.push(text);
      }

      const hasAnyText = pages.some((page) => page.length > 0);
      return {
        pages,
        pageCount: pdf.numPages,
        extractionStatus: hasAnyText ? 'extracted' : 'no_text_found',
      };
    } finally {
      await loadingTask.destroy();
    }
  }
}
