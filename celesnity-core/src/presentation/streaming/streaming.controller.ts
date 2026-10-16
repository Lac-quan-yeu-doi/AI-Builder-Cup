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

import { StreamingAdapterUseCases } from '@application/streaming/streaming-adapter.use-cases';
import { CreateMqttStreamAdapterRequestDto } from '@presentation/streaming/streaming.dto';
import {
  MqttStreamAdapterRegistrationResponseDto,
  MqttStreamAdapterResponseDto,
} from '@presentation/streaming/streaming.response';

@ApiTags('streaming')
@Controller('streaming/mqtt-adapters')
@RequireWorkspaceFeature('STREAMING')
export class StreamingController {
  public constructor(private readonly useCases: StreamingAdapterUseCases) {}

  @Post()
  @ApiOperation({ summary: 'Register and asynchronously provision an MQTT adapter' })
  @ApiCreatedResponse({ type: MqttStreamAdapterRegistrationResponseDto })
  public async create(
    @Body() request: CreateMqttStreamAdapterRequestDto,
  ): Promise<MqttStreamAdapterRegistrationResponseDto> {
    return MqttStreamAdapterRegistrationResponseDto.from(await this.useCases.create(request));
  }

  @Get()
  @ApiOperation({ summary: 'List MQTT adapters' })
  @ApiOkResponse({ type: MqttStreamAdapterResponseDto, isArray: true })
  public async list(
    @Query('tenantStorageKey') tenantStorageKey?: string,
  ): Promise<readonly MqttStreamAdapterResponseDto[]> {
    return (await this.useCases.list(tenantStorageKey)).map((adapter) =>
      MqttStreamAdapterResponseDto.from(adapter),
    );
  }

  @Get(':id')
  @ApiOkResponse({ type: MqttStreamAdapterRegistrationResponseDto })
  public async get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MqttStreamAdapterResponseDto> {
    return MqttStreamAdapterResponseDto.from(await this.useCases.get(id));
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MqttStreamAdapterResponseDto })
  public async pause(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MqttStreamAdapterResponseDto> {
    return MqttStreamAdapterResponseDto.from(await this.useCases.pause(id));
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MqttStreamAdapterResponseDto })
  public async resume(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MqttStreamAdapterResponseDto> {
    return MqttStreamAdapterResponseDto.from(await this.useCases.resume(id));
  }

  @Post(':id/credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MqttStreamAdapterResponseDto })
  public async rotateCredentials(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MqttStreamAdapterRegistrationResponseDto> {
    return MqttStreamAdapterRegistrationResponseDto.from(await this.useCases.rotateCredentials(id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  public archive(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.useCases.archive(id);
  }
}
