import { randomUUID } from 'node:crypto';

import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { ListNodeDefinitionsQueryDto } from '@presentation/node-catalog/node-catalog.dto';
import {
  NodeCategoryCollectionResponseDto,
  NodeDefinitionCollectionResponseDto,
  type ResponseMetaValue,
  SingleNodeDefinitionResponseDto,
} from '@presentation/node-catalog/node-catalog.response';

@ApiTags('node catalog')
@Controller()
@RequireWorkspaceFeature('PIPELINES')
export class NodeCatalogController {
  public constructor(private readonly useCases: NodeCatalogUseCases) {}

  @Get('node-categories')
  @ApiOperation({ summary: 'List visual pipeline node categories' })
  @ApiOkResponse({ type: NodeCategoryCollectionResponseDto })
  public listCategories(
    @Res({ passthrough: true }) response: Response,
  ): NodeCategoryCollectionResponseDto {
    return NodeCategoryCollectionResponseDto.from(
      this.useCases.listCategories(),
      responseMeta(response),
    );
  }

  @Get('node-definitions')
  @ApiOperation({ summary: 'Search visual pipeline node definitions' })
  @ApiOkResponse({ type: NodeDefinitionCollectionResponseDto })
  public async listDefinitions(
    @Query() query: ListNodeDefinitionsQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<NodeDefinitionCollectionResponseDto> {
    return NodeDefinitionCollectionResponseDto.from(
      await this.useCases.listDefinitions(query),
      responseMeta(response),
    );
  }

  @Get('node-definitions/:nodeType')
  @ApiOperation({ summary: 'Get a visual pipeline node definition and property schema' })
  @ApiOkResponse({ type: SingleNodeDefinitionResponseDto })
  public async getDefinition(
    @Param('nodeType') nodeType: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SingleNodeDefinitionResponseDto> {
    return SingleNodeDefinitionResponseDto.from(
      await this.useCases.getDefinition(nodeType),
      responseMeta(response),
    );
  }
}

function responseMeta(response: Response): ResponseMetaValue {
  const current = response.getHeader('X-Request-Id');
  const requestId = typeof current === 'string' && current !== '' ? current : randomUUID();
  if (current !== requestId) {
    response.setHeader('X-Request-Id', requestId);
  }
  return { requestId, timestamp: new Date().toISOString() };
}
