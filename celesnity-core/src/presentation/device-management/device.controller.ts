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
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { DeviceUseCases } from '@application/device-management/device.use-cases';
import {
  DeviceCheckInRequestDto,
  ListDevicesQueryDto,
  RegisterDeviceRequestDto,
  ReplaceDeviceRequestDto,
  TransitionDeviceLifecycleRequestDto,
  UpdateDeviceRequestDto,
} from '@presentation/device-management/device.dto';
import {
  DeviceLifecycleTransitionResponseDto,
  DeviceRegistrationResponseDto,
  DeviceResponseDto,
} from '@presentation/device-management/device.response';

@ApiTags('device-management')
@Controller('device-management/devices')
@RequireWorkspaceFeature('DEVICES')
export class DeviceController {
  public constructor(private readonly useCases: DeviceUseCases) {}

  @Post()
  @ApiOperation({ summary: 'Register and asynchronously provision a device' })
  @ApiCreatedResponse({ type: DeviceRegistrationResponseDto })
  public async register(
    @Body() request: RegisterDeviceRequestDto,
  ): Promise<DeviceRegistrationResponseDto> {
    return DeviceRegistrationResponseDto.from(await this.useCases.register(request));
  }

  @Get()
  @ApiOperation({ summary: 'List devices for an MQTT adapter' })
  @ApiOkResponse({ type: DeviceResponseDto, isArray: true })
  public async list(@Query() query: ListDevicesQueryDto): Promise<readonly DeviceResponseDto[]> {
    return (await this.useCases.list(query)).map((device) => DeviceResponseDto.from(device));
  }

  @Get(':id')
  @ApiOkResponse({ type: DeviceResponseDto })
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<DeviceResponseDto> {
    return DeviceResponseDto.from(await this.useCases.get(id));
  }

  @Patch(':id')
  @ApiOkResponse({ type: DeviceResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() request: UpdateDeviceRequestDto,
  ): Promise<DeviceResponseDto> {
    return DeviceResponseDto.from(await this.useCases.update(id, request));
  }

  @Post(':id/provisioning-confirmations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm that factory flashing completed successfully' })
  @ApiOkResponse({ type: DeviceResponseDto })
  public async confirmProvisioning(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeviceResponseDto> {
    return DeviceResponseDto.from(await this.useCases.confirmProvisioning(id));
  }

  @Post(':id/lifecycle-transitions')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeviceResponseDto })
  public async transitionLifecycle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() request: TransitionDeviceLifecycleRequestDto,
  ): Promise<DeviceResponseDto> {
    return DeviceResponseDto.from(await this.useCases.transitionLifecycle(id, request));
  }

  @Get(':id/lifecycle-transitions')
  @ApiOkResponse({ type: DeviceLifecycleTransitionResponseDto, isArray: true })
  public async listLifecycleTransitions(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<readonly DeviceLifecycleTransitionResponseDto[]> {
    return (await this.useCases.listLifecycleTransitions(id)).map((transition) =>
      DeviceLifecycleTransitionResponseDto.from(transition),
    );
  }

  @Post(':id/check-ins')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a gateway or gateway-relayed sensor check-in' })
  @ApiOkResponse({ type: DeviceResponseDto })
  public async checkIn(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() request: DeviceCheckInRequestDto,
  ): Promise<DeviceResponseDto> {
    return DeviceResponseDto.from(await this.useCases.recordCheckIn(id, request));
  }

  @Post(':id/replacements')
  @ApiOperation({ summary: 'Replace a sensor while preserving its measurement point' })
  @ApiCreatedResponse({ type: DeviceRegistrationResponseDto })
  public async replace(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() request: ReplaceDeviceRequestDto,
  ): Promise<DeviceRegistrationResponseDto> {
    return DeviceRegistrationResponseDto.from(await this.useCases.replace(id, request));
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeviceResponseDto })
  public async activate(@Param('id', new ParseUUIDPipe()) id: string): Promise<DeviceResponseDto> {
    return DeviceResponseDto.from(await this.useCases.activate(id));
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeviceResponseDto })
  public async suspend(@Param('id', new ParseUUIDPipe()) id: string): Promise<DeviceResponseDto> {
    return DeviceResponseDto.from(await this.useCases.suspend(id));
  }

  @Post(':id/credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeviceRegistrationResponseDto })
  public async rotateCredentials(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeviceRegistrationResponseDto> {
    return DeviceRegistrationResponseDto.from(await this.useCases.rotateCredentials(id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  public retire(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.useCases.retire(id);
  }
}
