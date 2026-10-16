import type { ListDocumentsUseCase } from '@/src/application/use-cases/documents/list-documents.use-case';
import {
  presentDocument,
  type DocumentViewModel,
} from '@/src/interface-adapters/presenters/document.presenter';

export type ListDocumentsController = () => Promise<readonly DocumentViewModel[]>;

export const createListDocumentsController =
  (useCase: ListDocumentsUseCase): ListDocumentsController =>
  async (): Promise<readonly DocumentViewModel[]> => {
    const documents = await useCase();
    return documents.map(presentDocument);
  };
