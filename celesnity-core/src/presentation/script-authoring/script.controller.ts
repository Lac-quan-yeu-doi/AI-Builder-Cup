import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ScriptAuthoringUseCases } from '@application/script-authoring/script-authoring.use-cases';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  CreateScriptRequestDto,
  PublishScriptVersionRequestDto,
  UpdateScriptRequestDto,
} from '@presentation/script-authoring/script.dto';
import {
  ScriptResponseDto,
  ScriptSourceResponseDto,
  ScriptVersionResponseDto,
} from '@presentation/script-authoring/script.response';

@ApiTags('scripts')
@Controller('scripts')
@RequireWorkspaceFeature('PIPELINES')
export class ScriptController {
  public constructor(private readonly useCases: ScriptAuthoringUseCases) {}

  @Post()
  @ApiOperation({ summary: 'Create an active script draft' })
  @ApiCreatedResponse({ type: ScriptResponseDto })
  public async create(@Body() request: CreateScriptRequestDto): Promise<ScriptResponseDto> {
    const script = await this.useCases.create({
      name: request.name,
      description: request.description,
      connectionId: request.connectionId,
    });
    return ScriptResponseDto.from(script);
  }

  @Get()
  @ApiOperation({ summary: 'List active scripts' })
  @ApiOkResponse({ type: ScriptResponseDto, isArray: true })
  public async list(): Promise<readonly ScriptResponseDto[]> {
    const scripts = await this.useCases.list();
    return scripts.map((script) => ScriptResponseDto.from(script));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an active script' })
  @ApiOkResponse({ type: ScriptResponseDto })
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ScriptResponseDto> {
    const script = await this.useCases.get(id);
    return ScriptResponseDto.from(script);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update active script metadata' })
  @ApiOkResponse({ type: ScriptResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() request: UpdateScriptRequestDto,
  ): Promise<ScriptResponseDto> {
    const script = await this.useCases.update({
      id,
      name: request.name,
      description: request.description,
      connectionId: request.connectionId,
    });
    return ScriptResponseDto.from(script);
  }

  @Post(':id/versions')
  @ApiOperation({ summary: 'Publish a new immutable script source version' })
  @ApiCreatedResponse({ type: ScriptVersionResponseDto })
  public async publishVersion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() request: PublishScriptVersionRequestDto,
  ): Promise<ScriptVersionResponseDto> {
    const version = await this.useCases.publishVersion({
      scriptId: id,
      source: request.source,
    });
    return ScriptVersionResponseDto.from(version);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List immutable published versions of an active script' })
  @ApiOkResponse({ type: ScriptVersionResponseDto, isArray: true })
  public async listVersions(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<readonly ScriptVersionResponseDto[]> {
    const versions = await this.useCases.listVersions(id);
    return versions.map((version) => ScriptVersionResponseDto.from(version));
  }

  @Get(':id/versions/:version/source')
  @ApiOperation({ summary: 'Read and integrity-check an exact published script source' })
  @ApiOkResponse({ type: ScriptSourceResponseDto })
  public async getVersionSource(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<ScriptSourceResponseDto> {
    const source = await this.useCases.getVersionSource(id, version);
    return ScriptSourceResponseDto.from(source);
  }
}
