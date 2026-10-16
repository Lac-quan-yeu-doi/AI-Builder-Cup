import type { GetDocumentContentUseCase } from '@/src/application/use-cases/documents/get-document-content.use-case';

export type GetDocumentContentController = GetDocumentContentUseCase;

export const createGetDocumentContentController =
  (useCase: GetDocumentContentUseCase): GetDocumentContentController =>
  (input) =>
    useCase(input);
