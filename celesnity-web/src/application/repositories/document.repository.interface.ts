import type { Document, DocumentContent } from '@/src/entities/models/document';

export interface DocumentRepository {
  list(cursor?: string, limit?: number): Promise<readonly Document[]>;
  findById(id: string): Promise<Document>;
  getContent(id: string, mimeType: string): Promise<DocumentContent>;
  upload(file: File): Promise<Document>;
}
