import { PdfjsTextExtractor } from '@infrastructure/document/pdfjs-text-extractor';
import type {
  PdfjsDocument,
  PdfjsModule,
  PdfjsPage,
} from '@infrastructure/document/pdfjs-text-extractor';

/**
 * `pdfjs-dist`'s Node build is ESM-only, and Jest's CommonJS runtime can't
 * execute a real dynamic `import()` of it (see the class doc comment) — so
 * this fakes the loader to test `PdfjsTextExtractor`'s own page-iteration
 * and status logic. Real extraction is verified out of band (see the PR/
 * commit message this file shipped with for the manual repro).
 */
function fakeModule(pagesText: readonly (string | undefined)[]): {
  module: PdfjsModule;
  destroy: jest.Mock;
} {
  const destroy = jest.fn(async () => undefined);
  const pages: PdfjsPage[] = pagesText.map((str) => ({
    getTextContent: async () => ({ items: str === undefined ? [] : [{ str }] }),
  }));
  const document: PdfjsDocument = {
    numPages: pages.length,
    getPage: async (pageNumber: number) => pages[pageNumber - 1]!,
  };
  const module: PdfjsModule = {
    getDocument: () => ({ promise: Promise.resolve(document), destroy }),
  };
  return { module, destroy };
}

describe('PdfjsTextExtractor', () => {
  it('passes a plain Uint8Array to PDF.js when given a Node Buffer', async () => {
    const { module } = fakeModule(['Report']);
    const getDocument = jest.spyOn(module, 'getDocument');
    const extractor = new PdfjsTextExtractor(() => Promise.resolve(module));

    await extractor.extract(Buffer.from('%PDF-test'));

    const data = getDocument.mock.calls[0]![0].data;
    expect(Buffer.isBuffer(data)).toBe(false);
    expect(data).toEqual(new Uint8Array(Buffer.from('%PDF-test')));
  });

  it('extracts text per page and reports extracted when any page has text', async () => {
    const { module, destroy } = fakeModule(['Page one.', 'Page two.']);
    const extractor = new PdfjsTextExtractor(() => Promise.resolve(module));

    const result = await extractor.extract(new Uint8Array());

    expect(result).toEqual({
      pages: ['Page one.', 'Page two.'],
      pageCount: 2,
      extractionStatus: 'extracted',
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('reports no_text_found when every page comes back empty', async () => {
    const { module } = fakeModule([undefined, undefined]);
    const extractor = new PdfjsTextExtractor(() => Promise.resolve(module));

    const result = await extractor.extract(new Uint8Array());

    expect(result).toEqual({
      pages: ['', ''],
      pageCount: 2,
      extractionStatus: 'no_text_found',
    });
  });

  it('destroys the loading task even when extraction throws', async () => {
    const destroy = jest.fn(async () => undefined);
    const module: PdfjsModule = {
      getDocument: () => ({ promise: Promise.reject(new Error('bad PDF')), destroy }),
    };
    const extractor = new PdfjsTextExtractor(() => Promise.resolve(module));

    await expect(extractor.extract(new Uint8Array())).rejects.toThrow('bad PDF');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
