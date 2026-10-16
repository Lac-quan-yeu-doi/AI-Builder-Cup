import { describe, expect, it, vi } from 'vitest';

import { createUploadDocumentUseCase } from '@/src/application/use-cases/documents/upload-document.use-case';
import type { DocumentRepository } from '@/src/application/repositories/document.repository.interface';

describe('createUploadDocumentUseCase', () => {
  it('accepts a non-PDF file and delegates it to the repository', async () => {
    const document = {
      id: 'doc-1',
      filename: 'report.csv',
      mimeType: 'text/csv',
      pageCount: 1,
      extractionStatus: 'extracted' as const,
      chartPreviews: [],
      createdAt: '2026-09-27T00:00:00.000Z',
    };
    const repository = {
      upload: vi.fn().mockResolvedValue(document),
    } as unknown as DocumentRepository;
    const useCase = createUploadDocumentUseCase(repository);
    const file = new File(['name,value\nAda,42'], 'report.csv', { type: 'text/csv' });

    await expect(useCase(file)).resolves.toEqual(document);
    expect(repository.upload).toHaveBeenCalledWith(file);
  });
});
