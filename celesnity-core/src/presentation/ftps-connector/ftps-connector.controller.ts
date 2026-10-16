import { Controller, Get } from '@nestjs/common';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { FtpsConnectorService } from '@application/ftps-connector/ftps-connector.service';
import {
  FtpsConnectorMetadataResponseDto,
  FtpsConnectorStatusResponseDto,
} from '@presentation/ftps-connector/ftps-connector.response';

@ApiTags('ftps-connectors')
@Controller('ftps-connector')
@RequireWorkspaceFeature('CONNECTIONS')
export class FtpsConnectorController {
  public constructor(private readonly service: FtpsConnectorService) {}

  @Get()
  @ApiOperation({ summary: 'Get the configured inbound FTPS endpoint metadata' })
  @ApiOkResponse({ type: FtpsConnectorMetadataResponseDto })
  public metadata(): FtpsConnectorMetadataResponseDto {
    return FtpsConnectorMetadataResponseDto.from(this.service.metadata());
  }

  @Get('status')
  @ApiOperation({ summary: 'Check whether this FTPS user has an active connection' })
  @ApiOkResponse({ type: FtpsConnectorStatusResponseDto })
  public async status(): Promise<FtpsConnectorStatusResponseDto> {
    return FtpsConnectorStatusResponseDto.from(await this.service.status());
  }
}
