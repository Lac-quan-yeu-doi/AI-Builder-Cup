import { DocumentUseCases } from '@application/document/document.use-cases';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IDocumentRepository } from '@application/document/interfaces/i-document.repository';
import type { IDocumentStorage } from '@application/document/interfaces/i-document-storage';
import type {
  ExtractedDocument,
  IDocumentTextExtractor,
} from '@application/document/interfaces/i-document-text-extractor';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { Document } from '@domain/document/models/document';
import type { IAgentRunFilesClient } from '@application/automation-workflow/interfaces/i-agent-run-files-client';

function buildUseCases(
  extractResult?: Partial<ExtractedDocument> | (() => Promise<ExtractedDocument>),
) {
  let stored: Document | null = null;
  const repository: IDocumentRepository = {
    create: jest.fn(async (document: Document) => {
      stored = document;
      return document;
    }),
    findById: jest.fn(async () => stored),
    list: jest.fn(async () => (stored ? [stored] : [])),
  };
  const putCalls: Array<{ storageKey: string; bytes: Uint8Array; mimeType: string }> = [];
  const storage: IDocumentStorage = {
    put: jest.fn(async (storageKey: string, bytes: Uint8Array, mimeType: string) => {
      putCalls.push({ storageKey, bytes, mimeType });
    }),
    get: jest.fn(async () => PDF_BYTES),
  };
  const extractor: IDocumentTextExtractor = {
    extract: jest.fn(async (): Promise<ExtractedDocument> => {
      if (typeof extractResult === 'function') return extractResult();
      const defaults: ExtractedDocument = {
        pages: ['Hello world.'],
        pageCount: 1,
        extractionStatus: 'extracted',
      };
      return { ...defaults, ...extractResult };
    }),
  };
  const clock: IClock = { now: () => new Date('2026-08-24T00:00:00.000Z') };
  const ids: IIdGenerator = { next: () => 'doc-1' };
  const runFiles: IAgentRunFilesClient = {
    listFiles: jest.fn(async () => []),
    getFileContent: jest.fn(async () => ({
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('%PDF-test'));
          controller.close();
        },
      }),
      contentType: 'application/pdf',
      fileName: 'report.pdf',
    })),
  };
  return {
    useCases: new DocumentUseCases(
      repository,
      storage,
      extractor,
      clock,
      ids,
      {
        require: () => ({ organizationId: 'org-a', agentRunId: 'run-a' }),
      } as AuthenticatedContextStore,
      runFiles,
    ),
    repository,
    storage,
    putCalls,
    runFiles,
  };
}

const PDF_BYTES = new Uint8Array([1, 2, 3]);

describe('DocumentUseCases', () => {
  it('publishes any file from the delegated Agent run with its MIME type', async () => {
    const { useCases, runFiles } = buildUseCases();
    const result = await useCases.createFromPath({ path: 'reports/report.pdf' });
    expect(runFiles.getFileContent).toHaveBeenCalledWith('run-a', 'reports/report.pdf', false);
    expect(result.sourceRunId).toBe('run-a');
    expect(result.filename).toBe('report.pdf');
  });

  it('stores a non-PDF run file without passing it through the PDF extractor', async () => {
    const { useCases, runFiles, storage } = buildUseCases();
    jest.mocked(runFiles.getFileContent).mockResolvedValue({
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('name,value\nAda,42'));
          controller.close();
        },
      }),
      contentType: 'text/csv; charset=utf-8',
      fileName: 'report.csv',
    });
    const result = await useCases.createFromPath({ path: 'reports/report.csv' });
    expect(result).toMatchObject({ filename: 'report.csv', mimeType: 'text/csv', pageCount: 1 });
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/\.csv$/),
      expect.any(Uint8Array),
      'text/csv',
    );
  });
  describe('upload', () => {
    it('persists the trusted source run for a published PDF', async () => {
      const { useCases } = buildUseCases();
      const document = await useCases.upload({
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        bytes: PDF_BYTES,
        sourceRunId: 'agent-run-1',
      });
      expect(document.sourceRunId).toBe('agent-run-1');
    });
    it('stores the file and persists extracted pages', async () => {
      const { useCases, putCalls } = buildUseCases({
        pages: ['Page one.', 'Page two.'],
        pageCount: 2,
      });

      const document = await useCases.upload({
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        bytes: PDF_BYTES,
      });

      expect(document).toMatchObject({
        id: 'doc-1',
        filename: 'report.pdf',
        pageCount: 2,
        extractionStatus: 'extracted',
      });
      expect(putCalls).toEqual([
        { storageKey: 'documents/org-a/doc-1.pdf', bytes: PDF_BYTES, mimeType: 'application/pdf' },
      ]);
    });

    it('stores arbitrary file types without claiming text extraction', async () => {
      const { useCases, storage } = buildUseCases();
      const document = await useCases.upload({
        filename: 'x.docx',
        mimeType: 'application/msword',
        bytes: PDF_BYTES,
      });
      expect(document).toMatchObject({
        filename: 'x.docx',
        mimeType: 'application/msword',
        pageCount: 0,
      });
      expect(storage.put).toHaveBeenCalled();
    });

    it('rejects a file larger than the byte limit', async () => {
      const { useCases } = buildUseCases();
      const huge = new Uint8Array(21 * 1024 * 1024);

      await expect(
        useCases.upload({ filename: 'huge.pdf', mimeType: 'application/pdf', bytes: huge }),
      ).rejects.toThrow('exceeds the');
    });

    it('rejects a document with more pages than the limit, without storing it', async () => {
      const { useCases, storage } = buildUseCases({ pageCount: 201, pages: [] });

      await expect(
        useCases.upload({ filename: 'huge.pdf', mimeType: 'application/pdf', bytes: PDF_BYTES }),
      ).rejects.toThrow('201 pages');
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('wraps an extractor failure as a DocumentError', async () => {
      const { useCases } = buildUseCases(() => Promise.reject(new Error('corrupt PDF')));

      await expect(
        useCases.upload({ filename: 'bad.pdf', mimeType: 'application/pdf', bytes: PDF_BYTES }),
      ).rejects.toThrow('corrupt PDF');
    });

    it('marks a scanned PDF as no_text_found instead of silently empty', async () => {
      const { useCases } = buildUseCases({
        pages: [''],
        pageCount: 1,
        extractionStatus: 'no_text_found',
      });

      const document = await useCases.upload({
        filename: 'scan.pdf',
        mimeType: 'application/pdf',
        bytes: PDF_BYTES,
      });

      expect(document.extractionStatus).toBe('no_text_found');
    });
  });

  it('looks up the scoped document before reading its original bytes', async () => {
    const { useCases, repository, storage } = buildUseCases();
    await expect(useCases.getContent('missing')).rejects.toThrow('Document not found');
    expect(storage.get).not.toHaveBeenCalled();
    await useCases.upload({
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      bytes: PDF_BYTES,
    });
    await expect(useCases.getContent('doc-1')).resolves.toMatchObject({ bytes: PDF_BYTES });
    expect(repository.findById).toHaveBeenCalledWith('doc-1');
    expect(storage.get).toHaveBeenCalledWith('documents/org-a/doc-1.pdf');
  });

  describe('getText', () => {
    it('returns every page joined when no range is given', async () => {
      const { useCases } = buildUseCases({ pages: ['One.', 'Two.', 'Three.'], pageCount: 3 });
      await useCases.upload({ filename: 'r.pdf', mimeType: 'application/pdf', bytes: PDF_BYTES });

      const result = await useCases.getText('doc-1');

      expect(result.text).toBe('One.\n\nTwo.\n\nThree.');
    });

    it('returns only the requested page range', async () => {
      const { useCases } = buildUseCases({ pages: ['One.', 'Two.', 'Three.'], pageCount: 3 });
      await useCases.upload({ filename: 'r.pdf', mimeType: 'application/pdf', bytes: PDF_BYTES });

      const result = await useCases.getText('doc-1', 2, 3);

      expect(result.text).toBe('Two.\n\nThree.');
    });

    it('rejects a page range outside the document', async () => {
      const { useCases } = buildUseCases({ pages: ['One.'], pageCount: 1 });
      await useCases.upload({ filename: 'r.pdf', mimeType: 'application/pdf', bytes: PDF_BYTES });

      await expect(useCases.getText('doc-1', 1, 5)).rejects.toThrow('outside');
    });

    it('throws not found for an unknown document', async () => {
      const { useCases } = buildUseCases();

      await expect(useCases.getText('missing')).rejects.toThrow('Document not found');
    });
  });

  describe('list', () => {
    it('caps the limit at 200', async () => {
      const { useCases, repository } = buildUseCases();

      await useCases.list(undefined, 10_000);

      expect(repository.list).toHaveBeenCalledWith(undefined, 200);
    });
  });

  describe('createFromText', () => {
    it('persists chart previews with an agent-written markdown document', async () => {
      const { useCases } = buildUseCases();
      const chartPreview = {
        kind: 'preview',
        title: 'Monthly orders',
        rows: [['2026-01', 42]],
      };

      const document = await useCases.createFromText({
        filename: 'orders.md',
        text: '# Orders\n\n<chart-preview title="Monthly orders" />',
        chartPreviews: [chartPreview],
      });

      expect(document.chartPreviews).toEqual([chartPreview]);
    });

    it('persists the trusted source agent run for automation reports', async () => {
      const { useCases } = buildUseCases();

      const document = await useCases.createFromText({
        filename: 'orders.md',
        text: '# Orders',
        sourceRunId: 'agent-run-1',
      });

      expect(document.sourceRunId).toBe('agent-run-1');
    });

    it('wraps the text as a single-page markdown document by default', async () => {
      const { useCases, putCalls } = buildUseCases();

      const document = await useCases.createFromText({
        filename: 'daily-report.md',
        text: '# Daily report\n\nEverything looks good.',
      });

      expect(document).toMatchObject({
        id: 'doc-1',
        filename: 'daily-report.md',
        mimeType: 'text/markdown',
        pageCount: 1,
        extractionStatus: 'extracted',
      });
      expect(document.pages).toEqual(['# Daily report\n\nEverything looks good.']);
      expect(putCalls).toEqual([
        {
          storageKey: 'documents/org-a/doc-1.md',
          bytes: new TextEncoder().encode('# Daily report\n\nEverything looks good.'),
          mimeType: 'text/markdown',
        },
      ]);
    });

    it('accepts an explicit text/plain mime type with the matching extension', async () => {
      const { useCases, putCalls } = buildUseCases();

      await useCases.createFromText({
        filename: 'notes.txt',
        text: 'plain notes',
        mimeType: 'text/plain',
      });

      expect(putCalls[0]?.storageKey).toBe('documents/org-a/doc-1.txt');
    });

    it('rejects an unsupported mime type before storing anything', async () => {
      const { useCases, storage } = buildUseCases();

      await expect(
        useCases.createFromText({ filename: 'x.pdf', text: 'x', mimeType: 'application/pdf' }),
      ).rejects.toThrow('Unsupported document type');
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('rejects text larger than the byte limit', async () => {
      const { useCases } = buildUseCases();
      const huge = 'x'.repeat(21 * 1024 * 1024);

      await expect(useCases.createFromText({ filename: 'huge.md', text: huge })).rejects.toThrow(
        'exceeds the',
      );
    });
  });
});
