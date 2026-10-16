import type { ActionDefinition } from '@application/actions/action.types';
import type { Document } from '@domain/document/models/document';

export const DOCUMENT_ACTIONS = Symbol('DocumentActions');

import type {
  CreateDocumentFromTextInput,
  DocumentText,
  DocumentUseCases,
  UploadDocumentInput,
} from './document.use-cases';

export interface DocumentActions {
  /** No `mcpTool` — a human/API uploads a document, an agent never does. */
  readonly upload: ActionDefinition<UploadDocumentInput, Document>;
  /** Unlike `upload`, an agent calls this directly to save a report it wrote — see `mcpTool` below. */
  readonly create: ActionDefinition<CreateDocumentInput, Document>;
  readonly getText: ActionDefinition<
    { documentId: string; startPage?: number; endPage?: number },
    DocumentText
  >;
  readonly getContent: ActionDefinition<
    { documentId: string },
    { document: Document; bytes: Uint8Array }
  >;
  readonly findById: ActionDefinition<{ documentId: string }, Document>;
  readonly list: ActionDefinition<{ cursor?: string; limit?: number }, readonly Document[]>;
}

export type CreateDocumentInput =
  CreateDocumentFromTextInput | { readonly path: string; readonly filename?: string };

const RUN_ID_PROPERTY = {
  type: 'string',
  description:
    'Auto-attached by the agent runtime to trace this call back to a run. Do not set manually.',
};

/**
 * Declares every document action's metadata once, mirroring
 * `chart.actions.ts`. `upload` has no `mcpTool` — the agent only ever reads
 * documents a human already uploaded, matching AIP Document Intelligence's
 * own split (a human configures/uploads, an agent's chatbot only retrieves
 * document context). Nothing here needs `approvalRequired`: uploading and
 * reading a document are neither destructive nor hard to reverse.
 * `auditRequired: false` throughout — `DocumentController` calls
 * `DocumentUseCases` directly rather than through `runAction()` (nothing
 * here needs approval, so the machinery that requires would add is pure
 * overhead), so there's no audit-log call site to honor `true` here.
 */
export function buildDocumentActions(useCases: DocumentUseCases): DocumentActions {
  return {
    upload: {
      name: 'document.upload',
      permission: 'write',
      auditRequired: false,
      approvalRequired: false,
      run: (input) => useCases.upload(input),
    },
    create: {
      name: 'document.create',
      permission: 'write',
      auditRequired: true,
      approvalRequired: false,
      mcpTool: {
        name: 'create_document',
        description:
          'Save a report or file as a platform document. Provide either content (plain text or Markdown) or path (a workspace relative file created in this run). The trusted run is used to fetch the file; do not supply run or organization IDs.',
        inputSchema: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Display filename, e.g. "daily-report-2026-09-06.md".',
            },
            content: { type: 'string', description: 'The full report text, markdown or plain.' },
            path: {
              type: 'string',
              description: 'Workspace relative file path, e.g. reports/daily.pdf.',
            },
            mime_type: {
              type: 'string',
              enum: ['text/markdown', 'text/plain'],
              description: 'Defaults to text/markdown.',
            },
            chart_previews: {
              type: 'array',
              description: 'Chart preview payloads to render inside the document viewer.',
              items: { type: 'object' },
            },
            run_id: RUN_ID_PROPERTY,
          },
          required: [],
        },
      },
      run: (input) =>
        'path' in input ? useCases.createFromPath(input) : useCases.createFromText(input),
    },
    getText: {
      name: 'document.getText',
      permission: 'read',
      auditRequired: false,
      approvalRequired: false,
      mcpTool: {
        name: 'get_document_text',
        description:
          'Get the extracted text of a previously uploaded document. Omit start_page/end_page ' +
          'to get the whole document; provide a range to fetch only part of a large document. ' +
          'The original file is also returned as an embedded resource.',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: {
              type: 'string',
              description: 'The document ID returned when it was uploaded',
            },
            start_page: {
              type: 'integer',
              description: '1-indexed, inclusive. Omit to start at page 1.',
            },
            end_page: {
              type: 'integer',
              description: '1-indexed, inclusive. Omit to go through the last page.',
            },
            run_id: RUN_ID_PROPERTY,
          },
          required: ['document_id'],
        },
      },
      run: ({ documentId, startPage, endPage }) => useCases.getText(documentId, startPage, endPage),
    },
    getContent: {
      name: 'document.getContent',
      permission: 'read',
      auditRequired: false,
      approvalRequired: false,
      run: ({ documentId }) => useCases.getContent(documentId),
    },
    findById: {
      name: 'document.findById',
      permission: 'read',
      auditRequired: false,
      approvalRequired: false,
      run: ({ documentId }) => useCases.findById(documentId),
    },
    list: {
      name: 'document.list',
      permission: 'read',
      auditRequired: false,
      approvalRequired: false,
      mcpTool: {
        name: 'list_documents',
        description: 'List previously uploaded documents (id, filename, page count).',
        inputSchema: {
          type: 'object',
          properties: {
            cursor: { type: 'string', description: 'Pagination cursor from a previous call.' },
            limit: {
              type: 'integer',
              description: 'Max results to return. Defaults to 50, capped at 200.',
            },
            run_id: RUN_ID_PROPERTY,
          },
        },
      },
      run: ({ cursor, limit }) => useCases.list(cursor, limit),
    },
  };
}
