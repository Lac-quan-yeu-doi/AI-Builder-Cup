import type { DocumentRepository } from '@/src/application/repositories/document.repository.interface';

export type GetDocumentContentUseCase = (input: {
  readonly documentId: string;
  readonly mimeType: string;
}) => ReturnType<DocumentRepository['getContent']>;

export const createGetDocumentContentUseCase =
  (repository: DocumentRepository): GetDocumentContentUseCase =>
  ({ documentId, mimeType }) =>
    repository.getContent(documentId, mimeType);
