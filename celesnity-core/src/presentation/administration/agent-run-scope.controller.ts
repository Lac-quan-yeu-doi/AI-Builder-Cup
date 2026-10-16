import { BadRequestException, Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

class AgentRunDatabaseScopeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  catalog?: string;

  @ApiProperty()
  @IsString()
  schema!: string;
}

class RegisterRunBody {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  runId!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,119}$/)
  agentName!: string;

  @ApiProperty({ type: AgentRunDatabaseScopeDto, nullable: true, description: 'null means All databases; user and Agent grants still apply.' })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  @ValidateNested()
  @Type(() => AgentRunDatabaseScopeDto)
  scope!: AgentRunDatabaseScopeDto | null;
}

@ApiTags('agent-runs')
@Controller('rooms/:roomId/agent-runs')
@RequireWorkspaceFeature('HOME')
export class AgentRunScopeController {
  public constructor(private readonly delegation: AgentRoomDelegationService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register an authenticated, bounded Agent run before admission' })
  @ApiNoContentResponse()
  public async register(
    @Param('roomId') roomId: string,
    @Body() body: RegisterRunBody,
  ): Promise<void> {
    if (!body || typeof body.runId !== 'string' || typeof body.agentName !== 'string' ||
      !Object.hasOwn(body, 'scope') ||
      (body.scope !== null && (typeof body.scope !== 'object' ||
        typeof body.scope.schema !== 'string' ||
        (body.scope.catalog !== undefined && typeof body.scope.catalog !== 'string'))))
      throw new BadRequestException({ code: 'RUN_SCOPE_INVALID', message: 'An explicit, valid run scope is required.' });
    await this.delegation.registerRun(roomId, body.runId, body.agentName, body.scope);
  }

  @Delete(':runId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Close an authenticated Agent run registration' })
  @ApiNoContentResponse()
  public async close(@Param('roomId') roomId: string, @Param('runId') runId: string): Promise<void> {
    await this.delegation.closeRun(roomId, runId);
  }
}
