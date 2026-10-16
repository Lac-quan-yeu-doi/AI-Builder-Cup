import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { requireAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { MessageBlockStreamWriter } from './message-block-stream.writer';

import { MessageBlockUseCases } from '@application/message-block/message-block.use-cases';
import { PublishMessageBlockDto } from './message-block.dto';
import { MessageBlockResponse } from './message-block.response';
import { AgentServiceGuard } from '@presentation/http/agent-service.guard';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';

@ApiTags('message-blocks')
@Controller('rooms/:roomId/message-blocks')
export class MessageBlockController {
  public constructor(
    private readonly useCases: MessageBlockUseCases,
    private readonly streams: MessageBlockStreamWriter,
  ) {}

  @Post('bind')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bind an agent room to the authenticated organization' })
  @ApiNoContentResponse({ description: 'The room is bound to the organization.' })
  public async bind(
    @Param('roomId') roomId: string,
    @Body() body: { agentName?: string },
  ): Promise<void> {
    await this.useCases.bindRoom(roomId, body?.agentName ?? '');
  }

  @Post()
  @MachineAuthenticated()
  @UseGuards(AgentServiceGuard)
  @ApiOperation({ summary: 'Ingest a structured message block published by an agent' })
  @ApiOkResponse({ type: MessageBlockResponse })
  public async publish(
    @Param('roomId') roomId: string,
    @Body() dto: PublishMessageBlockDto,
  ): Promise<MessageBlockResponse> {
    const block = await this.useCases.publish({
      roomId,
      runId: dto.run_id,
      blockType: dto.block_type,
      version: dto.version,
      payload: dto.payload,
      fallbackText: dto.fallback_text,
    });
    return MessageBlockResponse.from(block);
  }

  @Get()
  @ApiOperation({ summary: 'List message block history for a room, oldest first' })
  @ApiOkResponse({ type: MessageBlockResponse, isArray: true })
  public async list(
    @Param('roomId') roomId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<readonly MessageBlockResponse[]> {
    const blocks = await this.useCases.listByRoom(
      roomId,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
    return MessageBlockResponse.fromList(blocks);
  }

  @Get('stream')
  @ApiOperation({
    summary:
      'Stream new message blocks for a room as they are published. Pass the `id` of the ' +
      'last block seen from GET as `cursor` to resume without a gap or a duplicate at the hand-off.',
  })
  @ApiProduces('text/event-stream')
  public async streamBlocks(
    @Param('roomId') roomId: string,
    @Req() request: Request,
    @Res() response: Response,
    @Query('cursor') initialCursor?: string,
  ): Promise<void> {
    const principal = requireAuthenticatedPrincipal(request);
    await this.streams.stream(
      response,
      roomId,
      principal.organizationId,
      principal.identityId,
      initialCursor,
      request.headers['x-request-id'],
    );
  }
}
