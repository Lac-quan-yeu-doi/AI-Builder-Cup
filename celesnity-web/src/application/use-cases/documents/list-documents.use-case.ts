import type { Document } from '@/src/entities/models/document';
import type { DocumentRepository } from '@/src/application/repositories/document.repository.interface';

export type ListDocumentsUseCase = () => Promise<readonly Document[]>;

export const createListDocumentsUseCase =
  (repository: DocumentRepository): ListDocumentsUseCase =>
  (): Promise<readonly Document[]> => {
    return repository.list();
  };
