import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { ChartCollectionUseCases } from '@application/chart-collection/chart-collection.use-cases';
import type {
  CreateCollectionRecord,
  MoveCollectionRecord,
  RenameCollectionRecord,
} from '@application/chart-collection/interfaces/i-chart-collection.repository';
import { requireAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { ChartCollectionResponse } from './chart-collection.response';
import {
  CreateChartCollectionDto,
  MoveChartCollectionDto,
  UpdateChartCollectionDto,
} from './chart-collection.dto';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

@ApiTags('chart-collections')
@Controller('chart-collections')
@RequireWorkspaceFeature('ANALYTICS')
export class ChartCollectionController {
  public constructor(private readonly useCases: ChartCollectionUseCases) {}

  @Get()
  @ApiOperation({ summary: 'List chart collections visible to the current organization' })
  @ApiOkResponse({ type: ChartCollectionResponse, isArray: true })
  public async list(@Req() request: Request): Promise<readonly ChartCollectionResponse[]> {
    const principal = principalOf(request);
    const collections = await this.useCases.listCollections(principal);
    return Promise.all(
      collections.map(async (collection) =>
        ChartCollectionResponse.from(
          collection,
          await this.useCases.accessFor(collection.id, principal),
        ),
      ),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a shared chart collection' })
  @ApiOkResponse({ type: ChartCollectionResponse })
  public async create(
    @Body() dto: CreateChartCollectionDto,
    @Req() request: Request,
  ): Promise<ChartCollectionResponse> {
    const principal = principalOf(request);
    const input: CreateCollectionRecord = {
      organizationId: principal.organizationId,
      parentId: dto.parent_id ?? null,
      ownerIdentityId: null,
      type: 'COLLECTION',
      name: dto.name,
    };
    return ChartCollectionResponse.from(
      await this.useCases.createCollection(input, principal),
      'CURATE',
    );
  }

  @Patch(':collectionId/moves')
  @ApiOperation({ summary: 'Move a chart collection in the hierarchy' })
  public async move(
    @Param('collectionId') collectionId: string,
    @Body() dto: MoveChartCollectionDto,
    @Req() request: Request,
  ): Promise<ChartCollectionResponse> {
    const principal = principalOf(request);
    const input: MoveCollectionRecord = {
      collectionId,
      organizationId: principal.organizationId,
      parentId: dto.parent_id ?? null,
    };
    return ChartCollectionResponse.from(
      await this.useCases.moveCollection(input, principal),
      'CURATE',
    );
  }

  @Patch(':collectionId')
  @ApiOperation({ summary: 'Rename a chart collection' })
  public async update(
    @Param('collectionId') collectionId: string,
    @Body() dto: UpdateChartCollectionDto,
    @Req() request: Request,
  ): Promise<ChartCollectionResponse> {
    const principal = principalOf(request);
    const input: RenameCollectionRecord = {
      collectionId,
      organizationId: principal.organizationId,
      name: dto.name,
    };
    return ChartCollectionResponse.from(
      await this.useCases.renameCollection(input, principal),
      'CURATE',
    );
  }

  @Delete(':collectionId')
  @ApiOperation({ summary: 'Archive a chart collection' })
  public async archive(
    @Param('collectionId') collectionId: string,
    @Req() request: Request,
  ): Promise<void> {
    const principal = principalOf(request);
    await this.useCases.archiveCollection(
      { collectionId, organizationId: principal.organizationId },
      principal,
    );
  }
}

function principalOf(request: Request): {
  readonly organizationId: string;
  readonly identityId: string;
  readonly isOrganizationAdmin: boolean;
} {
  const principal = requireAuthenticatedPrincipal(request);
  return {
    organizationId: principal.organizationId,
    identityId: principal.identityId,
    isOrganizationAdmin: ['PLATFORM_ADMIN', 'ORG_OWNER', 'ORG_ADMIN'].includes(principal.role),
  };
}
