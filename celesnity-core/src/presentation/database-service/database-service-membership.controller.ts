import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  DatabaseServiceMembershipUseCases,
  type ListAvailableDatabaseServicesQuery,
} from '@application/database-service/database-service-membership.use-cases';
import { DatabaseServiceListQueryDto } from '@presentation/database-service/database-service.dto';
import {
  DatabaseServiceListResponseDto,
} from '@presentation/database-service/database-service.response';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('database-service-memberships')
@Controller('database-services')
@RequireWorkspaceFeature('CONNECTIONS', 'CATALOG_DATABASES')
export class DatabaseServiceMembershipController {
  public constructor(private readonly useCases: DatabaseServiceMembershipUseCases) {}

  @Get('available')
  @ApiOperation({ summary: 'List active datasources not linked to this catalog database' })
  @ApiOkResponse({ type: DatabaseServiceListResponseDto })
  public async listAvailable(
    @Query() query: DatabaseServiceListQueryDto,
  ): Promise<DatabaseServiceListResponseDto> {
    const availableQuery: ListAvailableDatabaseServicesQuery = {
      databaseName: query.databaseName ?? '',
      search: query.search,
      connectorType: query.connectorType,
      verificationStatus: query.verificationStatus,
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    };
    return DatabaseServiceListResponseDto.from(await this.useCases.listAvailable(availableQuery));
  }

  @Put(':databaseServiceId/memberships/:databaseName')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Link an existing datasource to this catalog database' })
  @ApiNoContentResponse()
  public attach(
    @Param('databaseName') databaseName: string,
    @Param('databaseServiceId', new ParseUUIDPipe()) databaseServiceId: string,
  ): Promise<void> {
    return this.useCases.attach({ databaseName, databaseServiceId });
  }

  @Delete(':databaseServiceId/memberships/:databaseName')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink a datasource from this catalog database' })
  @ApiNoContentResponse()
  public detach(
    @Param('databaseName') databaseName: string,
    @Param('databaseServiceId', new ParseUUIDPipe()) databaseServiceId: string,
  ): Promise<void> {
    return this.useCases.detach({ databaseName, databaseServiceId });
  }
}
