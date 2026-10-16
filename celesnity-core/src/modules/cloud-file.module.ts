import { Module } from '@nestjs/common';

import { CloudFileSourceRegistry } from '@application/cloud-file/cloud-file-source.registry';
import { CloudFileUseCases } from '@application/cloud-file/cloud-file.use-cases';
import type { ICloudFileSource } from '@application/cloud-file/interfaces/i-cloud-file-source';
import type { ICloudFileSourceRegistry } from '@application/cloud-file/interfaces/i-cloud-file-source-registry';
import { CLOUD_FILE_SOURCE_REGISTRY, CLOUD_FILE_SOURCES } from '@application/cloud-file/tokens';
import { GOOGLE_DRIVE_PROVIDER } from '@application/google-drive-connector/google-drive-connector.service';
import type { IOAuthAccessTokenProvider } from '@application/oauth-connection/i-oauth-access-token-provider';
import { OAUTH_ACCESS_TOKEN_PROVIDER } from '@application/oauth-connection/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import { CLOCK } from '@application/shared/tokens';
import { DownloadedWorkbookReader } from '@application/spreadsheet/downloaded-workbook.reader';
import type { ISpreadsheetParser } from '@application/spreadsheet/interfaces/i-spreadsheet-parser';
import type { ISpreadsheetReader } from '@application/spreadsheet/interfaces/i-spreadsheet-reader';
import type { ISpreadsheetWriter } from '@application/spreadsheet/interfaces/i-spreadsheet-writer';
import { SpreadsheetUseCases } from '@application/spreadsheet/spreadsheet.use-cases';
import {
  SPREADSHEET_PARSERS,
  SPREADSHEET_READERS,
  SPREADSHEET_WRITERS,
} from '@application/spreadsheet/tokens';
import { GoogleApiHttp } from '@infrastructure/google/google-api-http';
import { GoogleDriveFileSource } from '@infrastructure/google/google-drive-file-source';
import { GoogleSheetsWriter } from '@infrastructure/google/google-sheets-writer';
import { CsvSpreadsheetParser } from '@infrastructure/spreadsheet/csv-spreadsheet-parser';
import { ExcelJsSpreadsheetParser } from '@infrastructure/spreadsheet/exceljs-spreadsheet-parser';
import { SystemClock } from '@infrastructure/system/system-clock';
import { AdministrationModule } from '@modules/administration.module';
import { OAuthConnectionModule } from '@modules/oauth-connection.module';
import { SecurityModule } from '@modules/security.module';
import { CloudFileMcpController } from '@presentation/cloud-file/cloud-file-mcp.controller';

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const MAX_PARSED_CELLS = 2_000_000;
const GOOGLE_DRIVE_HTTP = Symbol('GoogleDriveHttp');

@Module({
  imports: [SecurityModule, AdministrationModule, OAuthConnectionModule],
  controllers: [CloudFileMcpController],
  providers: [
    SystemClock,
    { provide: CLOCK, useExisting: SystemClock },
    {
      provide: GOOGLE_DRIVE_HTTP,
      inject: [OAUTH_ACCESS_TOKEN_PROVIDER],
      useFactory: (tokens: IOAuthAccessTokenProvider): GoogleApiHttp =>
        new GoogleApiHttp(tokens, GOOGLE_DRIVE_PROVIDER),
    },
    {
      provide: GoogleDriveFileSource,
      inject: [GOOGLE_DRIVE_HTTP],
      useFactory: (http: GoogleApiHttp): GoogleDriveFileSource =>
        new GoogleDriveFileSource(http, {
          provider: GOOGLE_DRIVE_PROVIDER,
          maxDownloadBytes: MAX_DOWNLOAD_BYTES,
        }),
    },
    {
      provide: GoogleSheetsWriter,
      inject: [GOOGLE_DRIVE_HTTP],
      useFactory: (http: GoogleApiHttp): GoogleSheetsWriter =>
        new GoogleSheetsWriter(http, GOOGLE_DRIVE_PROVIDER),
    },
    {
      provide: CLOUD_FILE_SOURCES,
      inject: [GoogleDriveFileSource],
      useFactory: (drive: GoogleDriveFileSource): readonly ICloudFileSource[] => [drive],
    },
    {
      provide: SPREADSHEET_WRITERS,
      inject: [GoogleSheetsWriter],
      useFactory: (sheets: GoogleSheetsWriter): readonly ISpreadsheetWriter[] => [sheets],
    },
    {
      provide: SPREADSHEET_PARSERS,
      useFactory: (): readonly ISpreadsheetParser[] => [
        new ExcelJsSpreadsheetParser(MAX_PARSED_CELLS),
        new CsvSpreadsheetParser(MAX_PARSED_CELLS),
      ],
    },
    {
      provide: CLOUD_FILE_SOURCE_REGISTRY,
      inject: [CLOUD_FILE_SOURCES],
      useFactory: (sources: readonly ICloudFileSource[]): CloudFileSourceRegistry =>
        new CloudFileSourceRegistry(sources),
    },
    {
      provide: SPREADSHEET_READERS,
      inject: [CLOUD_FILE_SOURCE_REGISTRY, SPREADSHEET_PARSERS, CLOCK],
      useFactory: (
        sources: ICloudFileSourceRegistry,
        parsers: readonly ISpreadsheetParser[],
        clock: IClock,
      ): readonly ISpreadsheetReader[] => [
        new DownloadedWorkbookReader(sources, parsers, { ttlMs: 5 * 60_000, maxEntries: 20 }, clock),
      ],
    },
    {
      provide: CloudFileUseCases,
      inject: [CLOUD_FILE_SOURCE_REGISTRY],
      useFactory: (sources: ICloudFileSourceRegistry): CloudFileUseCases =>
        new CloudFileUseCases(sources),
    },
    {
      provide: SpreadsheetUseCases,
      inject: [CLOUD_FILE_SOURCE_REGISTRY, SPREADSHEET_READERS, SPREADSHEET_WRITERS],
      useFactory: (
        sources: ICloudFileSourceRegistry,
        readers: readonly ISpreadsheetReader[],
        writers: readonly ISpreadsheetWriter[],
      ): SpreadsheetUseCases =>
        new SpreadsheetUseCases(sources, readers, writers, {
          maxSampleRows: 20,
          maxRowsPerRead: 500,
          maxCellsPerWrite: 200_000,
          maxSheetsPerWrite: 50,
        }),
    },
  ],
  exports: [CLOUD_FILE_SOURCE_REGISTRY, CloudFileUseCases, SpreadsheetUseCases],
})
export class CloudFileModule {}
