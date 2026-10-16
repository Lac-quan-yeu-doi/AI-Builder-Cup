import type { DocumentRepository } from '@/src/application/repositories/document.repository.interface';
import type {
  Document,
  DocumentContent,
  DocumentExtractionStatus,
  DocumentText,
} from '@/src/entities/models/document';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface DocumentResponseDto {
  id: string;
  filename: string;
  mime_type: string;
  page_count: number;
  extraction_status: string;
  created_at: string;
}

interface DocumentTextResponseDto {
  document_id: string;
  page_count: number;
  extraction_status: string;
  text: string;
  chart_previews?: readonly Record<string, unknown>[];
}

export class CoreApiDocumentRepository implements DocumentRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(cursor?: string, limit?: number): Promise<readonly Document[]> {
    const params = new URLSearchParams();
    if (cursor !== undefined) params.set('cursor', cursor);
    if (limit !== undefined) params.set('limit', String(limit));
    const query = params.toString();
    const path = query ? `/documents?${query}` : '/documents';

    const response = await this.request<DocumentResponseDto[]>(path, { method: 'GET' });
    return response.map(mapDocument);
  }

  public async findById(id: string): Promise<Document> {
    const response = await this.request<DocumentResponseDto>(
      `/documents/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    return mapDocument(response);
  }

  public async upload(file: File): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.request<DocumentResponseDto>('/documents', {
      method: 'POST',
      body: formData,
    });
    return mapDocument(response);
  }

  public async getContent(id: string, mimeType: string): Promise<DocumentContent> {
    if (isTextMimeType(mimeType)) {
      const response = await this.request<DocumentTextResponseDto>(
        `/documents/${encodeURIComponent(id)}/text`,
        { method: 'GET' },
      );
      return { kind: 'text', content: mapDocumentText(response) };
    }
    try {
      const response = await this.transport.stream(`/documents/${encodeURIComponent(id)}/content`, {
        method: 'GET',
        headers: { Accept: '*/*' },
      });
      return { kind: 'file', blob: await response.blob() };
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
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

function mapDocument(dto: DocumentResponseDto): Document {
  return {
    id: dto.id,
    filename: dto.filename,
    mimeType: dto.mime_type,
    pageCount: dto.page_count,
    extractionStatus: dto.extraction_status as DocumentExtractionStatus,
    chartPreviews: [],
    createdAt: dto.created_at,
  };
}

function mapDocumentText(dto: DocumentTextResponseDto): DocumentText {
  return {
    documentId: dto.document_id,
    pageCount: dto.page_count,
    extractionStatus: dto.extraction_status as DocumentExtractionStatus,
    text: dto.text,
    chartPreviews: dto.chart_previews ?? [],
  };
}
