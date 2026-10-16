import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { DocumentUseCases } from '@application/document/document.use-cases';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { DocumentResponse, DocumentTextResponse } from './document.response';

/**
 * The fields this controller reads off whatever `multer` (via
 * `FileInterceptor`) attaches to the request. Defined locally rather than
 * via `Express.Multer.File` — this project's `tsconfig.json` restricts
 * automatic global type inclusion to `["node", "jest"]`, so `@types/multer`'s
 * ambient namespace merge isn't picked up.
 */
interface UploadedFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly buffer: Buffer;
}

@ApiTags('documents')
@Controller('documents')
@RequireWorkspaceFeature('DOCUMENTS')
export class DocumentController {
  public constructor(private readonly useCases: DocumentUseCases) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file and extract supported text' })
  @ApiOkResponse({ type: DocumentResponse })
  public async upload(@UploadedFile() file?: UploadedFile): Promise<DocumentResponse> {
    if (!file) {
      throw new BadRequestException({
        code: 'MISSING_FILE',
        message: 'A file is required (multipart field "file").',
        details: null,
      });
    }
    const document = await this.useCases.upload({
      filename: file.originalname,
      mimeType: file.mimetype,
      bytes: file.buffer,
    });
    return DocumentResponse.from(document);
  }

  @Get()
  @ApiOperation({ summary: 'List uploaded documents' })
  @ApiOkResponse({ type: DocumentResponse, isArray: true })
  public async list(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<readonly DocumentResponse[]> {
    const documents = await this.useCases.list(cursor, limit ? parseInt(limit, 10) : undefined);
    return DocumentResponse.fromList(documents);
  }

  @Get(':documentId')
  @ApiOperation({ summary: "Get a document's metadata" })
  @ApiOkResponse({ type: DocumentResponse })
  public async findById(@Param('documentId') documentId: string): Promise<DocumentResponse> {
    const document = await this.useCases.findById(documentId);
    return DocumentResponse.from(document);
  }

  @Get(':documentId/content')
  @ApiOperation({ summary: 'Get the original file content' })
  public async getContent(
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { document, bytes } = await this.useCases.getContent(documentId);
    const filename =
      // eslint-disable-next-line no-control-regex -- strip controls to prevent response header injection
      document.filename.replace(/["\\\u0000-\u001f\u007f]/g, '').trim() || 'document';
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Length', bytes.length);
    const disposition = isSafeInlineMimeType(document.mimeType) ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(Buffer.from(bytes));
  }

  @Get(':documentId/text')
  @ApiOperation({ summary: 'Get extracted text, optionally for a page range' })
  @ApiOkResponse({ type: DocumentTextResponse })
  public async getText(
    @Param('documentId') documentId: string,
    @Query('start_page') startPage?: string,
    @Query('end_page') endPage?: string,
  ): Promise<DocumentTextResponse> {
    const { document, text } = await this.useCases.getText(
      documentId,
      startPage === undefined ? undefined : parseInt(startPage, 10),
      endPage === undefined ? undefined : parseInt(endPage, 10),
    );
    return new DocumentTextResponse(document, text);
  }
}

function isSafeInlineMimeType(mimeType: string): boolean {
  return (
    mimeType === 'application/pdf' ||
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown' ||
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(mimeType)
  );
}
