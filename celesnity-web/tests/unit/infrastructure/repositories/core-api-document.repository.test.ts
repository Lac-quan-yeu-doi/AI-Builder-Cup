import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiDocumentRepository } from '@/src/infrastructure/repositories/core-api-document.repository';

describe('CoreApiDocumentRepository.getContent', () => {
  it('uses the authenticated binary endpoint for non-text documents', async () => {
    const blob = new Blob(['%PDF-test'], { type: 'application/pdf' });
    let request: { path: string; init?: RequestInit } | undefined;
    const transport: GeneratedApiTransport = {
      request: async () => {
        throw new Error('request is not used');
      },
      stream: async (path, init) => {
        request = { path, init };
        return new Response(blob, { status: 200 });
      },
    };
    const repository = new CoreApiDocumentRepository(transport);

    await expect(repository.getContent('doc/1', 'application/pdf')).resolves.toMatchObject({
      kind: 'file',
      blob,
    });
    expect(request).toEqual({
      path: '/documents/doc%2F1/content',
      init: { method: 'GET', headers: { Accept: '*/*' } },
    });
  });

  it('uses the extracted text endpoint for text-like documents', async () => {
    let path: string | undefined;
    const repository = new CoreApiDocumentRepository({
      request: async <TResponse>(requestedPath: string) => {
        path = requestedPath;
        return {
          document_id: 'doc-2',
          page_count: 1,
          extraction_status: 'extracted',
          text: 'hello',
          chart_previews: [],
        } as TResponse;
      },
      stream: async () => {
        throw new Error('stream is not used for text');
      },
    });

    await expect(repository.getContent('doc-2', 'text/plain')).resolves.toEqual({
      kind: 'text',
      content: {
        documentId: 'doc-2',
        pageCount: 1,
        extractionStatus: 'extracted',
        text: 'hello',
        chartPreviews: [],
      },
    });
    expect(path).toBe('/documents/doc-2/text');
  });
});
