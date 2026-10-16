import { Injectable } from '@nestjs/common';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';

import type { IDocumentRepository } from '@application/document/interfaces/i-document.repository';
import type { Document, DocumentExtractionStatus } from '@domain/document/models/document';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { Prisma } from '@generated/prisma/client';

@Injectable()
export class PrismaDocumentRepository implements IDocumentRepository {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  public async create(document: Document): Promise<Document> {
    const row = await this.prisma.client.document.create({
      data: {
        organizationId: this.contexts.require().organizationId,
        id: document.id,
        filename: document.filename,
        mimeType: document.mimeType,
        storageKey: document.storageKey,
        pages: document.pages,
        pageCount: document.pageCount,
        extractionStatus: document.extractionStatus,
        chartPreviews: document.chartPreviews as Prisma.InputJsonValue,
        sourceRunId: document.sourceRunId ?? null,
        createdAt: document.createdAt,
      },
    });
    return this.toDomain(row);
  }

  public async findById(id: string): Promise<Document | null> {
    const row = await this.prisma.client.document.findFirst({
      where: { id, organizationId: this.contexts.require().organizationId },
    });
    return row ? this.toDomain(row) : null;
  }

  public async list(cursor?: string, limit = 50): Promise<readonly Document[]> {
    const organizationId = this.contexts.require().organizationId;
    if (cursor !== undefined && (await this.findById(cursor)) === null) return [];
    const rows = await this.prisma.client.document.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: {
    id: string;
    filename: string;
    mimeType: string;
    storageKey: string;
    pages: unknown;
    pageCount: number;
    extractionStatus: string;
    chartPreviews: Prisma.JsonValue;
    sourceRunId: string | null;
    createdAt: Date;
  }): Document {
    return {
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      storageKey: row.storageKey,
      pages: Array.isArray(row.pages) ? (row.pages as string[]) : [],
      pageCount: row.pageCount,
      extractionStatus: row.extractionStatus as DocumentExtractionStatus,
      chartPreviews: Array.isArray(row.chartPreviews)
        ? (row.chartPreviews as Readonly<Record<string, unknown>[]>)
        : [],
      ...(row.sourceRunId === null ? {} : { sourceRunId: row.sourceRunId }),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
