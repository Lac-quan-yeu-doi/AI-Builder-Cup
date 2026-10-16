import type { UploadDocumentUseCase } from '@/src/application/use-cases/documents/upload-document.use-case';
import {
  presentDocument,
  type DocumentViewModel,
} from '@/src/interface-adapters/presenters/document.presenter';

export type UploadDocumentController = (file: File) => Promise<DocumentViewModel>;

export const createUploadDocumentController =
  (useCase: UploadDocumentUseCase): UploadDocumentController =>
  async (file: File): Promise<DocumentViewModel> => {
    const document = await useCase(file);
    return presentDocument(document);
  };
