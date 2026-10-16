import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { DeviceUseCases } from '@application/device-management/device.use-cases';
import {
  DeviceAlertQueryDto,
  DeviceAlertEventRequestDto,
  DeviceHeartbeatRequestDto,
} from '@presentation/device-management/device.dto';
import {
  DeviceAlertResponseDto,
  DeviceResponseDto,
} from '@presentation/device-management/device.response';
import {
  DeviceHeartbeatGuard,
  requireHeartbeatPrincipal,
} from '@presentation/device-management/device-heartbeat.guard';
import { Public } from '@presentation/http/public.decorator';

@ApiTags('device-management')
@Controller('device-management')
@RequireWorkspaceFeature('DEVICES')
export class DeviceHealthController {
  public constructor(private readonly useCases: DeviceUseCases) {}

  @Post('device-heartbeats')
  @Public()
  @UseGuards(DeviceHeartbeatGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a device-authenticated gateway or sensor heartbeat' })
  @ApiHeader({ name: 'authorization', description: 'Basic MQTT device credentials' })
  @ApiOkResponse({ type: DeviceResponseDto })
  public async heartbeat(
    @Req() request: Request,
    @Body() body: DeviceHeartbeatRequestDto,
  ): Promise<DeviceResponseDto> {
    return DeviceResponseDto.from(
      await this.useCases.recordAuthenticatedHeartbeat(requireHeartbeatPrincipal(request), body),
    );
  }

  @Post('device-alert-events')
  @Public()
  @UseGuards(DeviceHeartbeatGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest an idempotent gateway or bound-sensor alert event' })
  @ApiHeader({ name: 'authorization', description: 'Basic MQTT device credentials' })
  @ApiOkResponse({ type: DeviceAlertResponseDto })
  public async reportAlert(
    @Req() request: Request,
    @Body() body: DeviceAlertEventRequestDto,
  ): Promise<DeviceAlertResponseDto> {
    return DeviceAlertResponseDto.from(
      await this.useCases.reportAuthenticatedAlert(requireHeartbeatPrincipal(request), body),
    );
  }

  @Get('device-alerts')
  @ApiOkResponse({ type: DeviceAlertResponseDto, isArray: true })
  public async listAlerts(
    @Query() query: DeviceAlertQueryDto,
  ): Promise<readonly DeviceAlertResponseDto[]> {
    return (await this.useCases.listAlerts(query)).map((alert) =>
      DeviceAlertResponseDto.from(alert),
    );
  }

  @Post('device-alerts/:id/acknowledgements')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeviceAlertResponseDto })
  public async acknowledge(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeviceAlertResponseDto> {
    return DeviceAlertResponseDto.from(await this.useCases.acknowledgeAlert(id));
  }

  @Post('device-alerts/:id/clearances')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeviceAlertResponseDto })
  public async clear(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeviceAlertResponseDto> {
    return DeviceAlertResponseDto.from(await this.useCases.clearAlert(id));
  }
}
