import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { FirmwareCampaignUseCases } from '@application/device-management/firmware-campaign.use-cases';
import { CreateFirmwareCampaignRequestDto } from '@presentation/device-management/firmware-campaign.dto';
import { FirmwareCampaignResponseDto } from '@presentation/device-management/firmware-campaign.response';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('device-firmware-campaigns')
@Controller('device-management/firmware-campaigns')
@RequireWorkspaceFeature('DEVICES')
export class FirmwareCampaignController {
  public constructor(private readonly useCases: FirmwareCampaignUseCases) {}

  @Post()
  @ApiOperation({ summary: 'Create a staged firmware campaign for explicitly selected devices' })
  @ApiCreatedResponse({ type: FirmwareCampaignResponseDto })
  public async create(
    @Body() request: CreateFirmwareCampaignRequestDto,
  ): Promise<FirmwareCampaignResponseDto> {
    return FirmwareCampaignResponseDto.from(await this.useCases.create(request));
  }

  @Get()
  @ApiOkResponse({ type: FirmwareCampaignResponseDto, isArray: true })
  public async list(): Promise<readonly FirmwareCampaignResponseDto[]> {
    return (await this.useCases.list()).map((campaign) =>
      FirmwareCampaignResponseDto.from(campaign),
    );
  }

  @Get(':campaignId')
  @ApiOkResponse({ type: FirmwareCampaignResponseDto })
  public async get(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
  ): Promise<FirmwareCampaignResponseDto> {
    return FirmwareCampaignResponseDto.from(await this.useCases.get(campaignId));
  }

  @Post(':campaignId/start')
  @ApiOkResponse({ type: FirmwareCampaignResponseDto })
  public async start(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
  ): Promise<FirmwareCampaignResponseDto> {
    return FirmwareCampaignResponseDto.from(await this.useCases.start(campaignId));
  }

  @Post(':campaignId/advance')
  @ApiOkResponse({ type: FirmwareCampaignResponseDto })
  public async advance(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
  ): Promise<FirmwareCampaignResponseDto> {
    return FirmwareCampaignResponseDto.from(await this.useCases.advance(campaignId));
  }

  @Post(':campaignId/pause')
  @ApiOkResponse({ type: FirmwareCampaignResponseDto })
  public async pause(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
  ): Promise<FirmwareCampaignResponseDto> {
    return FirmwareCampaignResponseDto.from(await this.useCases.pause(campaignId));
  }

  @Post(':campaignId/resume')
  @ApiOkResponse({ type: FirmwareCampaignResponseDto })
  public async resume(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
  ): Promise<FirmwareCampaignResponseDto> {
    return FirmwareCampaignResponseDto.from(await this.useCases.resume(campaignId));
  }

  @Post(':campaignId/abort')
  @ApiOkResponse({ type: FirmwareCampaignResponseDto })
  public async abort(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
  ): Promise<FirmwareCampaignResponseDto> {
    return FirmwareCampaignResponseDto.from(await this.useCases.abort(campaignId));
  }
}
