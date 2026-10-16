import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import {
  CatalogResponseDto,
  NamespaceResponseDto,
  TableMetadataResponseDto,
  TableSnapshotResponseDto,
  TablePreviewResponseDto,
  TableSummaryResponseDto,
} from '@presentation/catalog-exploration/catalog.response';
import {
  CreateNamespaceDto,
  UpdateNamespaceDescriptionDto,
} from '@presentation/catalog-exploration/catalog.dto';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('catalogs')
@Controller('catalogs')
@RequireWorkspaceFeature('CATALOG_DATABASES', 'CATALOG_TABLES', 'QUERY', 'ANALYTICS', 'PIPELINES')
export class CatalogController {
  public constructor(private readonly useCases: CatalogExplorationUseCases) {}

  @Get()
  @ApiOperation({ summary: 'List the configured Trino catalog and its JDBC identity' })
  @ApiOkResponse({ type: CatalogResponseDto, isArray: true })
  public async listCatalogs(): Promise<readonly CatalogResponseDto[]> {
    return (await this.useCases.listVisibleCatalogs()).map((catalog) =>
      CatalogResponseDto.from(catalog),
    );
  }

  @Get(':catalog/schemas')
  @ApiOperation({ summary: 'List namespaces within a catalog' })
  @ApiQuery({
    name: 'writable',
    required: false,
    schema: { type: 'boolean', default: false },
    description:
      'Exclude the reserved namespaces (information_schema, system) a pipeline cannot target.',
  })
  @ApiOkResponse({ type: NamespaceResponseDto, isArray: true })
  public async listSchemas(
    @Param('catalog') catalog: string,
    @Query('writable') writable?: string,
  ): Promise<readonly NamespaceResponseDto[]> {
    // Opt-in rather than the default: the reserved namespaces are legitimate
    // browsing targets, and dropping them for every caller would change what
    // the existing catalog tree shows.
    const namespaces =
      writable === 'true'
        ? await this.useCases.listWritableSchemas(catalog)
        : await this.useCases.listSchemas(catalog);
    return namespaces.map((namespace) => NamespaceResponseDto.from(namespace));
  }

  @Post(':catalog/schemas')
  @RequireWorkspaceFeature('CATALOG_DATABASES')
  @ApiOperation({ summary: 'Create a managed Iceberg database (namespace)' })
  @ApiCreatedResponse({ type: NamespaceResponseDto })
  public async createSchema(
    @Param('catalog') catalog: string,
    @Body() input: CreateNamespaceDto,
  ): Promise<NamespaceResponseDto> {
    return NamespaceResponseDto.from(
      await this.useCases.createSchema(catalog, input.name, input.description),
    );
  }

  @Patch(':catalog/schemas/:schema')
  @RequireWorkspaceFeature('CATALOG_DATABASES')
  @ApiOperation({ summary: "Update a managed database's optional description" })
  @ApiOkResponse({ type: NamespaceResponseDto })
  public async updateSchemaDescription(
    @Param('catalog') catalog: string,
    @Param('schema') schema: string,
    @Body() input: UpdateNamespaceDescriptionDto,
  ): Promise<NamespaceResponseDto> {
    return NamespaceResponseDto.from(
      await this.useCases.updateSchemaDescription(catalog, schema, input.description ?? undefined),
    );
  }

  @Get(':catalog/schemas/:schema/tables')
  @RequireWorkspaceFeature('CATALOG_TABLES', 'QUERY', 'ANALYTICS', 'PIPELINES')
  @ApiOperation({ summary: 'List tables and views within a namespace' })
  @ApiOkResponse({ type: TableSummaryResponseDto, isArray: true })
  public async listTables(
    @Param('catalog') catalog: string,
    @Param('schema') schema: string,
  ): Promise<readonly TableSummaryResponseDto[]> {
    const tables = await this.useCases.listTables(catalog, schema);
    return tables.map((table) => TableSummaryResponseDto.from(table));
  }

  @Get(':catalog/schemas/:schema/tables/:table/columns')
  @RequireWorkspaceFeature('CATALOG_TABLES', 'QUERY', 'ANALYTICS', 'PIPELINES')
  @ApiOperation({ summary: "List a table's columns and Trino-visible data types" })
  @ApiOkResponse({ type: TableMetadataResponseDto })
  public async listColumns(
    @Param('catalog') catalog: string,
    @Param('schema') schema: string,
    @Param('table') table: string,
  ): Promise<TableMetadataResponseDto> {
    const metadata = await this.useCases.listColumns(catalog, schema, table);
    return TableMetadataResponseDto.from(metadata);
  }

  @Get(':catalog/schemas/:schema/tables/:table/snapshots')
  @RequireWorkspaceFeature('CATALOG_TABLES')
  @ApiOperation({ summary: 'List Iceberg snapshots exposed through Trino system tables' })
  @ApiOkResponse({ type: TableSnapshotResponseDto, isArray: true })
  public async listSnapshots(
    @Param('catalog') catalog: string,
    @Param('schema') schema: string,
    @Param('table') table: string,
  ): Promise<readonly TableSnapshotResponseDto[]> {
    const snapshots = await this.useCases.listSnapshots(catalog, schema, table);
    return snapshots.map((snapshot) => TableSnapshotResponseDto.from(snapshot));
  }

  @Get(':catalog/schemas/:schema/tables/:table/preview')
  @RequireWorkspaceFeature('CATALOG_TABLES')
  @ApiOperation({ summary: 'Preview table rows with a server-side row limit' })
  @ApiQuery({
    name: 'deviceId',
    required: false,
    format: 'uuid',
    description:
      'Restrict a Device Management Bronze preview to one device and return newest events first.',
  })
  @ApiOkResponse({ type: TablePreviewResponseDto })
  public async previewTable(
    @Param('catalog') catalog: string,
    @Param('schema') schema: string,
    @Param('table') table: string,
    @Query('deviceId', new ParseUUIDPipe({ optional: true })) deviceId?: string,
  ): Promise<TablePreviewResponseDto> {
    const preview = await this.useCases.previewTable(catalog, schema, table, deviceId);
    return TablePreviewResponseDto.from(preview);
  }
}
