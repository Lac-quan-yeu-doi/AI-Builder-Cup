import { ApiProperty } from '@nestjs/swagger';

import type { Document } from '@domain/document/models/document';

export class DocumentResponse {
  @ApiProperty({ format: 'uuid' })
  public readonly id: string;

  @ApiProperty()
  public readonly filename: string;

  @ApiProperty()
  public readonly mime_type: string;

  @ApiProperty()
  public readonly page_count: number;

  @ApiProperty({ enum: ['extracted', 'no_text_found'] })
  public readonly extraction_status: string;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  public readonly chart_previews: readonly Readonly<Record<string, unknown>>[];

  @ApiProperty({ format: 'date-time' })
  public readonly created_at: string;

  private constructor(document: Document) {
    this.id = document.id;
    this.filename = document.filename;
    this.mime_type = document.mimeType;
    this.page_count = document.pageCount;
    this.extraction_status = document.extractionStatus;
    this.chart_previews = document.chartPreviews;
    this.created_at = document.createdAt;
  }

  public static from(document: Document): DocumentResponse {
    return new DocumentResponse(document);
  }

  public static fromList(documents: readonly Document[]): readonly DocumentResponse[] {
    return documents.map((d) => DocumentResponse.from(d));
  }
}

export class DocumentTextResponse {
  @ApiProperty({ format: 'uuid' })
  public readonly document_id: string;

  @ApiProperty()
  public readonly page_count: number;

  @ApiProperty({ enum: ['extracted', 'no_text_found'] })
  public readonly extraction_status: string;

  @ApiProperty()
  public readonly text: string;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  public readonly chart_previews: readonly Readonly<Record<string, unknown>>[];

  public constructor(document: Document, text: string) {
    this.document_id = document.id;
    this.page_count = document.pageCount;
    this.extraction_status = document.extractionStatus;
    this.text = text;
    this.chart_previews = document.chartPreviews;
  }
}
