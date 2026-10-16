import type { Document } from '@domain/document/models/document';

export interface IDocumentRepository {
  create(document: Document): Promise<Document>;
  findById(id: string): Promise<Document | null>;
  list(cursor?: string, limit?: number): Promise<readonly Document[]>;
}
