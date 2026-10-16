import type { Document } from '@/src/entities/models/document';
import type { DocumentRepository } from '@/src/application/repositories/document.repository.interface';

export type UploadDocumentUseCase = (file: File) => Promise<Document>;

export const createUploadDocumentUseCase =
  (repository: DocumentRepository): UploadDocumentUseCase =>
  (file: File): Promise<Document> => {
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('File size must not exceed 20 MB.');
    }
    return repository.upload(file);
  };
