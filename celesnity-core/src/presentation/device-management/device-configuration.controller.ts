import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { DeviceConfigurationUseCases } from '@application/device-management/device-configuration.use-cases';
import {
  DeviceConfigurationEventRequestDto,
  CreateDeviceConfigurationTemplateRequestDto,
  DeployDeviceConfigurationTemplateRequestDto,
  PushDeviceConfigurationRequestDto,
} from '@presentation/device-management/device-configuration.dto';
import {
  DeviceConfigurationResponseDto,
  DeviceConfigurationTemplateDeploymentResponseDto,
  DeviceConfigurationTemplateResponseDto,
} from '@presentation/device-management/device-configuration.response';
import { DeviceConfigurationEventTokenGuard } from '@presentation/device-management/device-configuration-event-token.guard';
import { Public } from '@presentation/http/public.decorator';

@ApiTags('device-configuration')
@Controller('device-management')
@RequireWorkspaceFeature('DEVICES')
export class DeviceConfigurationController {
  public constructor(private readonly useCases: DeviceConfigurationUseCases) {}

  @Post('devices/:deviceId/configurations')
  @ApiOperation({ summary: 'Push a monotonically versioned configuration to one active device' })
  @ApiCreatedResponse({ type: DeviceConfigurationResponseDto })
  public async push(
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Body() request: PushDeviceConfigurationRequestDto,
  ): Promise<DeviceConfigurationResponseDto> {
    return DeviceConfigurationResponseDto.from(await this.useCases.push(deviceId, request));
  }

  @Get('devices/:deviceId/configurations')
  @ApiOkResponse({ type: DeviceConfigurationResponseDto, isArray: true })
  public async list(
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
  ): Promise<readonly DeviceConfigurationResponseDto[]> {
    return (await this.useCases.list(deviceId)).map((configuration) =>
      DeviceConfigurationResponseDto.from(configuration),
    );
  }

  @Post('device-configuration-templates')
  @ApiOperation({ summary: 'Create the next immutable version of a configuration template' })
  @ApiCreatedResponse({ type: DeviceConfigurationTemplateResponseDto })
  public async createTemplate(
    @Body() request: CreateDeviceConfigurationTemplateRequestDto,
  ): Promise<DeviceConfigurationTemplateResponseDto> {
    return DeviceConfigurationTemplateResponseDto.from(await this.useCases.createTemplate(request));
  }

  @Get('device-configuration-templates')
  @ApiOkResponse({ type: DeviceConfigurationTemplateResponseDto, isArray: true })
  public async listTemplates(): Promise<readonly DeviceConfigurationTemplateResponseDto[]> {
    return (await this.useCases.listTemplates()).map((template) =>
      DeviceConfigurationTemplateResponseDto.from(template),
    );
  }

  @Post('device-configuration-templates/:templateId/deployments')
  @ApiOperation({ summary: 'Push a template to active devices matching a site or type' })
  @ApiCreatedResponse({ type: DeviceConfigurationTemplateDeploymentResponseDto })
  public async deployTemplate(
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() request: DeployDeviceConfigurationTemplateRequestDto,
  ): Promise<DeviceConfigurationTemplateDeploymentResponseDto> {
    return DeviceConfigurationTemplateDeploymentResponseDto.from(
      await this.useCases.deployTemplate(templateId, request),
    );
  }

  @Post('device-configurations/:configurationId/events')
  @Public()
  @UseGuards(DeviceConfigurationEventTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acknowledge an atomic configuration apply or rollback' })
  @ApiHeader({ name: 'x-device-configuration-token', required: true })
  @ApiOkResponse({ type: DeviceConfigurationResponseDto })
  public async reportEvent(
    @Param('configurationId', new ParseUUIDPipe()) configurationId: string,
    @Headers('x-device-configuration-token') token: string | undefined,
    @Body() request: DeviceConfigurationEventRequestDto,
  ): Promise<DeviceConfigurationResponseDto> {
    return DeviceConfigurationResponseDto.from(
      await this.useCases.reportEvent(configurationId, { ...request, token: token ?? '' }),
    );
  }
}
