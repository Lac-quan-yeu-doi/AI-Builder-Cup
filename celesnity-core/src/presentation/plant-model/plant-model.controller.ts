import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PlantModelUseCases } from '@application/plant-model/plant-model.use-cases';
import { PlantCatalogLookupUseCases } from '@application/plant-model/plant-catalog-lookup.use-cases';
import { RequirePermission } from '@presentation/http/required-permission.decorator';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  ApplyPlantTemplateDto,
  CreatePlantSiteDto,
  PlantVersionDiffQueryDto,
  PublishPlantModelDto,
  SavePlantModelDto,
  PlantCatalogLookupDto,
  AssociatePlantDashboardDto,
} from './plant-model.dto';
import { PlantModelCollectionResponseDto, PlantModelResponseDto } from './plant-model.response';

@ApiTags('plant-model')
@Controller()
@RequireWorkspaceFeature('PLANT_MODEL')
export class PlantModelController {
  public constructor(
    private readonly useCases: PlantModelUseCases,
    private readonly catalogLookups: PlantCatalogLookupUseCases,
  ) {}

  @Get('plant-sites')
  @RequirePermission('workspace:read')
  @ApiOperation({ summary: 'List plant sites' })
  @ApiOkResponse({ type: PlantModelCollectionResponseDto })
  public async listSites(): Promise<PlantModelCollectionResponseDto> {
    return PlantModelCollectionResponseDto.from(await this.useCases.listSites());
  }

  @Post('plant-sites')
  @RequirePermission('workspace:write')
  @ApiOperation({ summary: 'Create a plant site with an empty draft' })
  @ApiCreatedResponse({ type: PlantModelResponseDto })
  public async createSite(@Body() input: CreatePlantSiteDto): Promise<PlantModelResponseDto> {
    return PlantModelResponseDto.from(await this.useCases.createSite(input));
  }

  @Get('plant-sites/:siteId/model')
  @RequirePermission('workspace:read')
  public async getModel(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
  ): Promise<PlantModelResponseDto> {
    return PlantModelResponseDto.from(await this.useCases.getSite(siteId));
  }

  @Put('plant-sites/:siteId/model')
  @RequirePermission('workspace:write')
  public async saveModel(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Body() input: SavePlantModelDto,
  ): Promise<PlantModelResponseDto> {
    return PlantModelResponseDto.from(
      await this.useCases.save(siteId, input.draft, input.expectedRevision),
    );
  }

  @Post('plant-sites/:siteId/model/template-applications')
  @RequirePermission('workspace:write')
  public async applyTemplate(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Body() input: ApplyPlantTemplateDto,
  ): Promise<PlantModelResponseDto> {
    return PlantModelResponseDto.from(
      await this.useCases.applyTemplate(siteId, input.templateId, input.expectedRevision),
    );
  }

  @Post('plant-sites/:siteId/model/publish')
  @RequirePermission('workspace:write')
  public async publish(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Body() input: PublishPlantModelDto,
  ): Promise<PlantModelResponseDto> {
    return PlantModelResponseDto.from(
      await this.useCases.publish(siteId, input.expectedRevision, input.note),
    );
  }

  @Get('plant-sites/:siteId/model/versions')
  @RequirePermission('workspace:read')
  public async listVersions(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
  ): Promise<PlantModelCollectionResponseDto> {
    return PlantModelCollectionResponseDto.from(await this.useCases.listVersions(siteId));
  }

  @Get('plant-sites/:siteId/model/versions/diff')
  @RequirePermission('workspace:read')
  public async diffVersions(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Query() query: PlantVersionDiffQueryDto,
  ): Promise<PlantModelResponseDto> {
    return PlantModelResponseDto.from(
      await this.useCases.diffVersions(siteId, query.from, query.to),
    );
  }

  @Get('plant-sites/:siteId/reference-data')
  @RequirePermission('workspace:read')
  public async referenceData(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
  ): Promise<PlantModelResponseDto> {
    return PlantModelResponseDto.from(await this.useCases.referenceData(siteId));
  }

  @Get('plant-model-templates')
  @RequirePermission('workspace:read')
  public templates(): PlantModelCollectionResponseDto {
    return PlantModelCollectionResponseDto.from(this.useCases.listTemplates());
  }

  @Post('plant-model-catalog-lookups')
  @RequirePermission('workspace:read')
  public async resolveCatalogValue(
    @Body() input: PlantCatalogLookupDto,
  ): Promise<PlantModelResponseDto> {
    return PlantModelResponseDto.from(
      await this.catalogLookups.resolve(input.binding, input.nodeValues),
    );
  }

  @Get('plant-sites/:siteId/dashboards')
  @RequirePermission('workspace:read')
  public async listDashboards(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
  ): Promise<PlantModelCollectionResponseDto> {
    return PlantModelCollectionResponseDto.from(await this.useCases.listDashboards(siteId));
  }

  @Put('plant-sites/:siteId/dashboards/:dashboardId')
  @RequirePermission('workspace:write')
  public async associateDashboard(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Param('dashboardId', new ParseUUIDPipe()) dashboardId: string,
    @Body() input: AssociatePlantDashboardDto,
  ): Promise<PlantModelCollectionResponseDto> {
    return PlantModelCollectionResponseDto.from(
      await this.useCases.associateDashboard(siteId, dashboardId, input),
    );
  }

  @Delete('plant-sites/:siteId/dashboards/:dashboardId')
  @RequirePermission('workspace:write')
  public async removeDashboard(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Param('dashboardId', new ParseUUIDPipe()) dashboardId: string,
  ): Promise<void> {
    await this.useCases.removeDashboard(siteId, dashboardId);
  }
}
