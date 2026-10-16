import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CdcConnectionProfileUseCases } from '@application/database-service/cdc-connection-profile.use-cases';
import { PutCdcConnectionProfileRequestDto } from '@presentation/database-service/cdc-connection-profile.dto';
import { CdcConnectionProfileResponseDto } from '@presentation/database-service/cdc-connection-profile.response';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('database-services')
@Controller('database-services/:databaseServiceId/cdc-connection')
@RequireWorkspaceFeature('CONNECTIONS')
export class CdcConnectionProfileController {
  public constructor(private readonly useCases: CdcConnectionProfileUseCases) {}

  @Get()
  @ApiOperation({ summary: 'Get the datasource CDC connection profile' })
  @ApiOkResponse({ type: CdcConnectionProfileResponseDto })
  public async get(
    @Param('databaseServiceId', new ParseUUIDPipe()) databaseServiceId: string,
  ): Promise<CdcConnectionProfileResponseDto> {
    return CdcConnectionProfileResponseDto.from(await this.useCases.get(databaseServiceId));
  }

  @Put()
  @ApiOperation({ summary: 'Create or replace the datasource CDC connection profile' })
  @ApiOkResponse({ type: CdcConnectionProfileResponseDto })
  public async put(
    @Param('databaseServiceId', new ParseUUIDPipe()) databaseServiceId: string,
    @Body() request: PutCdcConnectionProfileRequestDto,
  ): Promise<CdcConnectionProfileResponseDto> {
    return CdcConnectionProfileResponseDto.from(
      await this.useCases.put({
        databaseServiceId,
        details: request.details,
        setupMode: request.setupMode,
        publicationName: request.publicationName,
        slotName: request.slotName,
      }),
    );
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate CDC prerequisites without mutating the datasource' })
  @ApiOkResponse({ type: CdcConnectionProfileResponseDto })
  public async validate(
    @Param('databaseServiceId', new ParseUUIDPipe()) databaseServiceId: string,
  ): Promise<CdcConnectionProfileResponseDto> {
    return CdcConnectionProfileResponseDto.from(await this.useCases.validate(databaseServiceId));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an unused platform CDC connection profile' })
  @ApiNoContentResponse()
  public remove(
    @Param('databaseServiceId', new ParseUUIDPipe()) databaseServiceId: string,
  ): Promise<void> {
    return this.useCases.remove(databaseServiceId);
  }
}
