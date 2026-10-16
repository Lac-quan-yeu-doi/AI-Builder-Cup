import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { FirmwareUseCases } from '@application/device-management/firmware.use-cases';
import {
  CreateFirmwareReleaseRequestDto,
  FirmwareDeploymentEventRequestDto,
  StartFirmwareDeploymentRequestDto,
  UploadFirmwareReleaseRequestDto,
} from '@presentation/device-management/firmware.dto';
import {
  FirmwareDeploymentResponseDto,
  FirmwareReleaseResponseDto,
} from '@presentation/device-management/firmware.response';
import { FirmwareEventTokenGuard } from '@presentation/device-management/firmware-event-token.guard';
import { Public } from '@presentation/http/public.decorator';

@ApiTags('device-firmware')
@Controller('device-management')
@RequireWorkspaceFeature('DEVICES')
export class FirmwareController {
  public constructor(private readonly useCases: FirmwareUseCases) {}

  @Post('firmware-releases')
  @ApiOperation({ summary: 'Register an immutable signed firmware release' })
  @ApiCreatedResponse({ type: FirmwareReleaseResponseDto })
  public async createRelease(
    @Body() request: CreateFirmwareReleaseRequestDto,
  ): Promise<FirmwareReleaseResponseDto> {
    return FirmwareReleaseResponseDto.from(await this.useCases.createRelease(request));
  }

  @Post('firmware-releases/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 64 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload firmware and sign it with the Celesnity signing authority' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'version', 'deviceModel'],
      properties: {
        file: { type: 'string', format: 'binary' },
        version: { type: 'string' },
        deviceModel: { type: 'string' },
        hardwareRevision: { type: 'string' },
        releaseNotes: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({ type: FirmwareReleaseResponseDto })
  public async uploadRelease(
    @Body() request: UploadFirmwareReleaseRequestDto,
    @UploadedFile() file?: UploadedFirmwareFile,
  ): Promise<FirmwareReleaseResponseDto> {
    if (file === undefined) {
      throw new BadRequestException({
        code: 'MISSING_FILE',
        message: 'A firmware file is required (multipart field "file").',
        details: null,
      });
    }
    return FirmwareReleaseResponseDto.from(
      await this.useCases.uploadRelease({
        ...request,
        fileName: file.originalname,
        contentType: file.mimetype || 'application/octet-stream',
        bytes: file.buffer,
      }),
    );
  }

  @Get('firmware-releases')
  @ApiOkResponse({ type: FirmwareReleaseResponseDto, isArray: true })
  public async listReleases(): Promise<readonly FirmwareReleaseResponseDto[]> {
    return (await this.useCases.listReleases()).map((release) =>
      FirmwareReleaseResponseDto.from(release),
    );
  }

  @Post('devices/:deviceId/firmware-deployments')
  @ApiOperation({ summary: 'Dispatch a firmware release to one compatible active device' })
  @ApiCreatedResponse({ type: FirmwareDeploymentResponseDto })
  public async startDeployment(
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Body() request: StartFirmwareDeploymentRequestDto,
  ): Promise<FirmwareDeploymentResponseDto> {
    return FirmwareDeploymentResponseDto.from(
      await this.useCases.startDeployment(deviceId, request),
    );
  }

  @Get('devices/:deviceId/firmware-deployments')
  @ApiOkResponse({ type: FirmwareDeploymentResponseDto, isArray: true })
  public async listDeployments(
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
  ): Promise<readonly FirmwareDeploymentResponseDto[]> {
    return (await this.useCases.listDeployments(deviceId)).map((deployment) =>
      FirmwareDeploymentResponseDto.from(deployment),
    );
  }

  @Post('firmware-deployments/:deploymentId/events')
  @Public()
  @UseGuards(FirmwareEventTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report token-authenticated firmware installation progress' })
  @ApiHeader({ name: 'x-firmware-event-token', required: true })
  @ApiOkResponse({ type: FirmwareDeploymentResponseDto })
  public async reportEvent(
    @Param('deploymentId', new ParseUUIDPipe()) deploymentId: string,
    @Headers('x-firmware-event-token') token: string | undefined,
    @Body() request: FirmwareDeploymentEventRequestDto,
  ): Promise<FirmwareDeploymentResponseDto> {
    return FirmwareDeploymentResponseDto.from(
      await this.useCases.reportEvent(deploymentId, { ...request, token: token ?? '' }),
    );
  }
}

interface UploadedFirmwareFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly buffer: Buffer;
}
