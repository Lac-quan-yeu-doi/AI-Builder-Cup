import { DocumentController } from '@presentation/document/document.controller';
import type { Document } from '@domain/document/models/document';
import type { DocumentUseCases } from '@application/document/document.use-cases';

describe('DocumentController PDF content', () => {
  it('streams original bytes inline with a safe filename', async () => {
    const document: Document = {
      id: 'doc-1',
      filename: 'report"\r\n.pdf',
      mimeType: 'application/pdf',
      storageKey: 'documents/org-a/doc-1.pdf',
      pages: [],
      pageCount: 1,
      extractionStatus: 'no_text_found',
      chartPreviews: [],
      createdAt: '2026-09-27T00:00:00.000Z',
    };
    const useCases = {
      getContent: jest.fn(async () => ({ document, bytes: new Uint8Array([37, 80, 68, 70, 45]) })),
    };
    const controller = new DocumentController(useCases as unknown as DocumentUseCases);
    const headers = new Map<string, string>();
    const response = {
      setHeader: (key: string, value: string | number) => headers.set(key, String(value)),
    };

    const file = await controller.getContent('doc-1', response as never);

    expect(headers).toEqual(
      new Map([
        ['Content-Type', 'application/pdf'],
        ['Content-Length', '5'],
        ['Content-Disposition', 'inline; filename="report.pdf"'],
        ['Cache-Control', 'private, no-store'],
      ]),
    );
    expect(file).toBeDefined();
    expect(useCases.getContent).toHaveBeenCalledWith('doc-1');
  });
});
