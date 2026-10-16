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

import { DeviceLogUseCases } from '@application/device-management/device-log.use-cases';
import {
  DeviceLogEventRequestDto,
  DeviceLogQueryDto,
} from '@presentation/device-management/device-log.dto';
import { DeviceLogResponseDto } from '@presentation/device-management/device-log.response';
import {
  DeviceHeartbeatGuard,
  requireHeartbeatPrincipal,
} from '@presentation/device-management/device-heartbeat.guard';
import { Public } from '@presentation/http/public.decorator';

@ApiTags('device-management')
@Controller('device-management')
@RequireWorkspaceFeature('DEVICES')
export class DeviceLogController {
  public constructor(private readonly useCases: DeviceLogUseCases) {}

  @Post('device-log-events')
  @Public()
  @UseGuards(DeviceHeartbeatGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Store an idempotent gateway or bound-sensor log event' })
  @ApiHeader({ name: 'authorization', description: 'Basic MQTT device credentials' })
  @ApiOkResponse({ type: DeviceLogResponseDto })
  public async report(
    @Req() request: Request,
    @Body() body: DeviceLogEventRequestDto,
  ): Promise<DeviceLogResponseDto> {
    return DeviceLogResponseDto.from(
      await this.useCases.report(requireHeartbeatPrincipal(request), body),
    );
  }

  @Get('devices/:deviceId/logs')
  @ApiOkResponse({ type: DeviceLogResponseDto, isArray: true })
  public async list(
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Query() query: DeviceLogQueryDto,
  ): Promise<readonly DeviceLogResponseDto[]> {
    return (await this.useCases.list(deviceId, query)).map((entry) =>
      DeviceLogResponseDto.from(entry),
    );
  }
}
