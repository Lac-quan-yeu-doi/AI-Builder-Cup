import type { IClock } from '@application/shared/interfaces/i-clock';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { DocumentError } from '@domain/document/errors/document.errors';
import type { Document } from '@domain/document/models/document';
import type { DocumentChartPreview } from '@domain/document/models/document';
import type { IDocumentRepository } from './interfaces/i-document.repository';
import type { IDocumentStorage } from './interfaces/i-document-storage';
import type {
  ExtractedDocument,
  IDocumentTextExtractor,
} from './interfaces/i-document-text-extractor';
import type { IAgentRunFilesClient } from '@application/automation-workflow/interfaces/i-agent-run-files-client';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 200;
const MAX_AGENT_FILE_BYTES = 10 * 1024 * 1024;
const PDF_MIME_TYPE = 'application/pdf';
const OCTET_STREAM_MIME_TYPE = 'application/octet-stream';

const TEXT_MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'text/markdown': 'md',
  'text/plain': 'txt',
};
const SUPPORTED_TEXT_MIME_TYPES: readonly string[] = Object.keys(TEXT_MIME_EXTENSIONS);

export interface UploadDocumentInput {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly sourceRunId?: string;
}

export interface CreateDocumentFromTextInput {
  readonly filename: string;
  readonly text: string;
  /** Defaults to `text/markdown` — the only realistic case today is an agent-written report. */
  readonly mimeType?: string;
  readonly chartPreviews?: readonly DocumentChartPreview[];
  readonly sourceRunId?: string;
}

export interface DocumentText {
  readonly document: Document;
  readonly text: string;
}

export class DocumentUseCases {
  public constructor(
    private readonly repository: IDocumentRepository,
    private readonly storage: IDocumentStorage,
    private readonly extractor: IDocumentTextExtractor,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly contexts: AuthenticatedContextStore,
    private readonly runFiles: IAgentRunFilesClient,
  ) {}

  public async createFromPath(input: { path: string; filename?: string }): Promise<Document> {
    const context = this.contexts.require();
    const sourceRunId = context.agentRunId ?? context.automationRunId;
    if (!sourceRunId) throw new Error('Trusted Agent run is required to publish a file.');
    if (!input.path) throw new Error('A workspace relative file path is required.');
    const content = await this.runFiles.getFileContent(sourceRunId, input.path, false);
    if (!content?.body) throw new Error('Run file is unavailable.');
    if (content.contentLength !== undefined && content.contentLength > MAX_AGENT_FILE_BYTES) {
      throw DocumentError.tooLarge(content.contentLength, MAX_AGENT_FILE_BYTES);
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of content.body) {
      size += chunk.length;
      if (size > MAX_AGENT_FILE_BYTES) throw DocumentError.tooLarge(size, MAX_AGENT_FILE_BYTES);
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length === 0) throw new Error('Run file is empty.');
    const filename = input.filename?.trim() || content.fileName;
    if (!filename) throw new Error('Run file has no filename.');
    const mimeType = normalizeMimeType(content.contentType);
    return this.upload({ filename, mimeType, bytes, sourceRunId });
  }

  public async upload(input: UploadDocumentInput): Promise<Document> {
    const organizationId = this.contexts.require().organizationId;
    if (input.bytes.length > MAX_BYTES) {
      throw DocumentError.tooLarge(input.bytes.length, MAX_BYTES);
    }

    const extracted = await this.extractContent(input.bytes, input.mimeType);
    if (extracted.pageCount > MAX_PAGES) {
      throw DocumentError.tooManyPages(extracted.pageCount, MAX_PAGES);
    }

    const id = this.ids.next();
    const extension = input.filename.match(/\.([a-z0-9]{1,10})$/i)?.[1];
    const storageKey = `documents/${organizationId}/${id}${extension ? `.${extension}` : ''}`;
    await this.storage.put(storageKey, input.bytes, input.mimeType);

    const document: Document = {
      id,
      filename: input.filename,
      mimeType: input.mimeType,
      storageKey,
      pages: extracted.pages,
      pageCount: extracted.pageCount,
      extractionStatus: extracted.extractionStatus,
      chartPreviews: [],
      ...(input.sourceRunId === undefined ? {} : { sourceRunId: input.sourceRunId }),
      createdAt: this.clock.now().toISOString(),
    };
    return this.repository.create(document);
  }

  /**
   * For agent-written reports: the text IS the extracted content, so this
   * skips `IDocumentTextExtractor` entirely (that's PDF-specific) and wraps
   * the string as a single-page document.
   */
  public async createFromText(input: CreateDocumentFromTextInput): Promise<Document> {
    const organizationId = this.contexts.require().organizationId;
    const mimeType = input.mimeType ?? 'text/markdown';
    const extension = TEXT_MIME_EXTENSIONS[mimeType];
    if (extension === undefined) {
      throw DocumentError.unsupportedMimeType(mimeType, SUPPORTED_TEXT_MIME_TYPES);
    }
    const bytes = new TextEncoder().encode(input.text);
    if (bytes.length > MAX_BYTES) {
      throw DocumentError.tooLarge(bytes.length, MAX_BYTES);
    }

    const id = this.ids.next();
    const storageKey = `documents/${organizationId}/${id}.${extension}`;
    await this.storage.put(storageKey, bytes, mimeType);

    const document: Document = {
      id,
      filename: input.filename,
      mimeType,
      storageKey,
      pages: [input.text],
      pageCount: 1,
      extractionStatus: 'extracted',
      chartPreviews: input.chartPreviews ?? [],
      ...(input.sourceRunId === undefined ? {} : { sourceRunId: input.sourceRunId }),
      createdAt: this.clock.now().toISOString(),
    };
    return this.repository.create(document);
  }

  public async getText(id: string, startPage?: number, endPage?: number): Promise<DocumentText> {
    const document = await this.getOrThrow(id);

    if (startPage === undefined && endPage === undefined) {
      return { document, text: document.pages.join('\n\n') };
    }

    const start = startPage ?? 1;
    const end = endPage ?? document.pageCount;
    if (start < 1 || end > document.pageCount || start > end) {
      throw DocumentError.invalidPageRange(start, end, document.pageCount);
    }

    return { document, text: document.pages.slice(start - 1, end).join('\n\n') };
  }

  public async findById(id: string): Promise<Document> {
    return this.getOrThrow(id);
  }

  public async getContent(id: string): Promise<{ document: Document; bytes: Uint8Array }> {
    const document = await this.getOrThrow(id);
    return { document, bytes: await this.storage.get(document.storageKey) };
  }

  private async extractContent(bytes: Uint8Array, mimeType: string): Promise<ExtractedDocument> {
    if (mimeType === PDF_MIME_TYPE) {
      try {
        return await this.extractor.extract(bytes);
      } catch (err) {
        throw DocumentError.extractionFailed(err instanceof Error ? err.message : 'Unknown error');
      }
    }
    if (isTextMimeType(mimeType)) {
      const text = new TextDecoder().decode(bytes);
      return {
        pages: text.length > 0 ? [text] : [],
        pageCount: text.length > 0 ? 1 : 0,
        extractionStatus: text.length > 0 ? ('extracted' as const) : ('no_text_found' as const),
      };
    }
    return { pages: [], pageCount: 0, extractionStatus: 'no_text_found' as const };
  }

  public list(cursor?: string, limit?: number): Promise<readonly Document[]> {
    return this.repository.list(cursor, Math.min(limit ?? 50, 200));
  }

  private async getOrThrow(id: string): Promise<Document> {
    const document = await this.repository.findById(id);
    if (!document) {
      throw DocumentError.notFound(id);
    }
    return document;
  }
}

function normalizeMimeType(mimeType: string | undefined): string {
  const normalized = mimeType?.split(';')[0]?.trim().toLowerCase();
  return normalized && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(normalized)
    ? normalized
    : OCTET_STREAM_MIME_TYPE;
}

function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    [
      'application/csv',
      'application/json',
      'application/javascript',
      'application/typescript',
      'application/xml',
      'application/x-yaml',
      'application/yaml',
    ].includes(mimeType) ||
    mimeType.endsWith('+json') ||
    mimeType.endsWith('+xml')
  );
}
