import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createListDocumentsUseCase } from '@/src/application/use-cases/documents/list-documents.use-case';
import { createUploadDocumentUseCase } from '@/src/application/use-cases/documents/upload-document.use-case';
import { createGetDocumentContentUseCase } from '@/src/application/use-cases/documents/get-document-content.use-case';
import { CoreApiDocumentRepository } from '@/src/infrastructure/repositories/core-api-document.repository';
import { createListDocumentsController } from '@/src/interface-adapters/controllers/documents/list-documents.controller';
import { createUploadDocumentController } from '@/src/interface-adapters/controllers/documents/upload-document.controller';
import { createGetDocumentContentController } from '@/src/interface-adapters/controllers/documents/get-document-content.controller';

export function createDocumentsModule() {
  const documentsModule = createTypedModule();

  documentsModule
    .bind(DI_SYMBOLS.DocumentRepository)
    .toClass(CoreApiDocumentRepository, [DI_SYMBOLS.CoreApiClient]);

  documentsModule
    .bind(DI_SYMBOLS.ListDocumentsUseCase)
    .toHigherOrderFunction(createListDocumentsUseCase, [DI_SYMBOLS.DocumentRepository]);
  documentsModule
    .bind(DI_SYMBOLS.UploadDocumentUseCase)
    .toHigherOrderFunction(createUploadDocumentUseCase, [DI_SYMBOLS.DocumentRepository]);
  documentsModule
    .bind(DI_SYMBOLS.GetDocumentContentUseCase)
    .toHigherOrderFunction(createGetDocumentContentUseCase, [DI_SYMBOLS.DocumentRepository]);

  documentsModule
    .bind(DI_SYMBOLS.ListDocumentsController)
    .toHigherOrderFunction(createListDocumentsController, [DI_SYMBOLS.ListDocumentsUseCase]);
  documentsModule
    .bind(DI_SYMBOLS.UploadDocumentController)
    .toHigherOrderFunction(createUploadDocumentController, [DI_SYMBOLS.UploadDocumentUseCase]);
  documentsModule
    .bind(DI_SYMBOLS.GetDocumentContentController)
    .toHigherOrderFunction(createGetDocumentContentController, [
      DI_SYMBOLS.GetDocumentContentUseCase,
    ]);

  return documentsModule;
}
