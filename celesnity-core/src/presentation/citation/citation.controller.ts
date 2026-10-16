import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CitationUseCases } from '@application/citation/citation.use-cases';
import { RequirePermission } from '@presentation/http/required-permission.decorator';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { ResolveCitationsDto } from './citation.dto';
import { ResolvedCitationResponse } from './citation.response';

/**
 * Resolves `<citation>` tags (see `chat-assistant.yaml`) back into
 * something displayable. Read-only, but it's a POST (the citation list is a
 * body, not query params), so `AuthorizationGuard`'s method-based default
 * would otherwise treat it as `workspace:write` — explicit `workspace:read`
 * keeps a VIEWER/AUDITOR able to resolve citations shown in their own chat.
 */
@ApiTags('citations')
@Controller('citations')
@RequireWorkspaceFeature('HOME', 'ANALYTICS', 'DOCUMENTS')
export class CitationController {
  public constructor(private readonly useCases: CitationUseCases) {}

  @Post('resolve')
  @RequirePermission('workspace:read')
  @ApiOperation({ summary: 'Batch-resolve chart/document citations to their titles' })
  @ApiOkResponse({ type: ResolvedCitationResponse, isArray: true })
  public async resolve(
    @Body() dto: ResolveCitationsDto,
  ): Promise<readonly ResolvedCitationResponse[]> {
    const resolved = await this.useCases.resolve(dto.citations);
    return ResolvedCitationResponse.fromList(resolved);
  }
}
