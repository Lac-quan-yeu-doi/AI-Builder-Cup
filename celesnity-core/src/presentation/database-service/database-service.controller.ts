import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { DatabaseServiceUseCases } from '@application/database-service/database-service.use-cases';
import {
  ConnectionDetailsRequestDto,
  CreateConnectionRequestDto,
  CreateDatabaseServiceRequestDto,
  DatabaseServiceDetailsRequestDto,
  DatabaseServiceListQueryDto,
  UpdateConnectionRequestDto,
  UpdateDatabaseServiceRequestDto,
} from '@presentation/database-service/database-service.dto';
import {
  ConnectionResponseDto,
  ConnectionVerificationResponseDto,
  DataConnectionResponseDto,
  DatabaseServiceVerificationResponseDto,
  DatabaseServiceConnectorDescriptorResponseDto,
  DatabaseServiceListResponseDto,
  DatabaseServiceResponseDto,
} from '@presentation/database-service/database-service.response';
import {
  toCreateDatabaseServiceCommand,
  toTestUnsavedDatabaseServiceCommand,
  toUpdateDatabaseServiceCommand,
} from '@presentation/database-service/database-service.mapper';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('database-services')
@ApiExtraModels(
  ConnectionDetailsRequestDto,
  CreateConnectionRequestDto,
  UpdateConnectionRequestDto,
  ConnectionResponseDto,
  DataConnectionResponseDto,
  DatabaseServiceVerificationResponseDto,
)
@Controller()
@RequireWorkspaceFeature('CONNECTIONS')
export class DatabaseServiceController {
  public constructor(private readonly useCases: DatabaseServiceUseCases) {}

  @Post('database-service-tests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test unsaved DBMS connection details' })
  @ApiOkResponse({ type: ConnectionVerificationResponseDto })
  public async testUnsaved(
    @Body() request: DatabaseServiceDetailsRequestDto,
  ): Promise<ConnectionVerificationResponseDto> {
    const result = await this.useCases.testUnsaved(toTestUnsavedDatabaseServiceCommand(request));
    return ConnectionVerificationResponseDto.from(result);
  }

  @Post('database-services')
  @ApiOperation({ summary: 'Create a DBMS connection' })
  @ApiCreatedResponse({ type: DatabaseServiceResponseDto })
  public async create(
    @Body() request: CreateDatabaseServiceRequestDto,
  ): Promise<DatabaseServiceResponseDto> {
    const connection = await this.useCases.create(toCreateDatabaseServiceCommand(request));
    return DatabaseServiceResponseDto.from(connection);
  }

  @Get('database-services')
  @ApiOperation({ summary: 'List active DBMS connections' })
  @ApiOkResponse({ type: DatabaseServiceListResponseDto })
  public async list(
    @Query() query: DatabaseServiceListQueryDto,
  ): Promise<DatabaseServiceListResponseDto> {
    return DatabaseServiceListResponseDto.from(await this.useCases.list(query));
  }

  @Get('database-services/:id')
  @ApiOperation({ summary: 'Get an active DBMS connection' })
  @ApiOkResponse({ type: DatabaseServiceResponseDto })
  public async get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DatabaseServiceResponseDto> {
    const connection = await this.useCases.get(id);
    return DatabaseServiceResponseDto.from(connection);
  }

  @Patch('database-services/:id')
  @ApiOperation({ summary: 'Update a DBMS connection' })
  @ApiOkResponse({ type: DatabaseServiceResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() request: UpdateDatabaseServiceRequestDto,
  ): Promise<DatabaseServiceResponseDto> {
    const connection = await this.useCases.update(toUpdateDatabaseServiceCommand(request, id));
    return DatabaseServiceResponseDto.from(connection);
  }

  @Delete('database-services/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a DBMS connection' })
  @ApiNoContentResponse()
  public archive(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.useCases.archive(id);
  }

  @Post('database-services/:id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test and record a saved DBMS connection' })
  @ApiOkResponse({ type: ConnectionVerificationResponseDto })
  public async testSaved(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ConnectionVerificationResponseDto> {
    const result = await this.useCases.testSaved(id);
    return ConnectionVerificationResponseDto.from(result);
  }

  @Get('database-service-connectors')
  @ApiOperation({ summary: 'List available database connector descriptors' })
  @ApiOkResponse({ type: DatabaseServiceConnectorDescriptorResponseDto, isArray: true })
  public listConnectors(): readonly DatabaseServiceConnectorDescriptorResponseDto[] {
    return this.useCases
      .listConnectors()
      .map((descriptor) => DatabaseServiceConnectorDescriptorResponseDto.from(descriptor));
  }
}
