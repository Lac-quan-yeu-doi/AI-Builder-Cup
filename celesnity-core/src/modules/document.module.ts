import { forwardRef, Module } from '@nestjs/common';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';

import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { CLOCK, ID_GENERATOR } from '@application/shared/tokens';
import type { IDocumentRepository } from '@application/document/interfaces/i-document.repository';
import type { IDocumentStorage } from '@application/document/interfaces/i-document-storage';
import type { IDocumentTextExtractor } from '@application/document/interfaces/i-document-text-extractor';
import {
  buildDocumentActions,
  DOCUMENT_ACTIONS,
  type DocumentActions,
} from '@application/document/document.actions';
import { DocumentUseCases } from '@application/document/document.use-cases';
import {
  DOCUMENT_REPOSITORY,
  DOCUMENT_STORAGE,
  DOCUMENT_TEXT_EXTRACTOR,
} from '@application/document/tokens';
import { PdfjsTextExtractor } from '@infrastructure/document/pdfjs-text-extractor';
import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import { MinioDocumentStorage } from '@infrastructure/minio/document/minio-document-storage';
import { PrismaDocumentRepository } from '@infrastructure/prisma/document/prisma-document.repository';
import { SystemClock } from '@infrastructure/system/system-clock';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { DocumentController } from '@presentation/document/document.controller';
import { DocumentActionsCatalogController } from '@presentation/document/document-actions-catalog.controller';
import { DocumentMcpController } from '@presentation/document/document-mcp.controller';
import { ActionsModule } from './actions.module';
import { SecurityModule } from './security.module';
import { AdministrationModule } from './administration.module';
import { AgentRunFilesClient } from '@infrastructure/http/automation-workflow/agent-run-files.client';
import type { IAgentRunFilesClient } from '@application/automation-workflow/interfaces/i-agent-run-files-client';

@Module({
  imports: [SecurityModule, AdministrationModule, forwardRef(() => ActionsModule)],
  controllers: [DocumentController, DocumentActionsCatalogController, DocumentMcpController],
  providers: [
    PrismaDocumentRepository,
    MinioClientFactory,
    MinioDocumentStorage,
    PdfjsTextExtractor,
    SystemClock,
    RandomUuidGenerator,
    AgentRunFilesClient,
    { provide: DOCUMENT_REPOSITORY, useExisting: PrismaDocumentRepository },
    { provide: DOCUMENT_STORAGE, useExisting: MinioDocumentStorage },
    { provide: DOCUMENT_TEXT_EXTRACTOR, useExisting: PdfjsTextExtractor },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: DocumentUseCases,
      inject: [
        DOCUMENT_REPOSITORY,
        DOCUMENT_STORAGE,
        DOCUMENT_TEXT_EXTRACTOR,
        CLOCK,
        ID_GENERATOR,
        AuthenticatedContextStore,
        AgentRunFilesClient,
      ],
      useFactory: (
        repository: IDocumentRepository,
        storage: IDocumentStorage,
        extractor: IDocumentTextExtractor,
        clock: IClock,
        ids: IIdGenerator,
        contexts: AuthenticatedContextStore,
        runFiles: IAgentRunFilesClient,
      ): DocumentUseCases =>
        new DocumentUseCases(repository, storage, extractor, clock, ids, contexts, runFiles),
    },
    {
      provide: DOCUMENT_ACTIONS,
      inject: [DocumentUseCases],
      useFactory: (useCases: DocumentUseCases): DocumentActions => buildDocumentActions(useCases),
    },
  ],
  exports: [DocumentUseCases],
})
export class DocumentModule {}
