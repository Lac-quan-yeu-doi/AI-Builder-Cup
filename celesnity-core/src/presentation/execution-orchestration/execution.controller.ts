import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { from, interval, type Observable } from 'rxjs';
import { concatMap, distinctUntilChanged, map, startWith, takeWhile } from 'rxjs/operators';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';

import { ExecutionOrchestrationUseCases } from '@application/execution-orchestration/execution-orchestration.use-cases';
import { isTerminalStatus } from '@domain/execution-orchestration/value-objects/execution-value-objects';
import {
  ExecutionEventDto,
  ExecutionLogResponseDto,
  ExecutionResponseDto,
} from '@presentation/execution-orchestration/execution.response';

const MIN_STREAM_INTERVAL_MS = 750;

@ApiTags('executions')
@Controller('executions')
@RequireWorkspaceFeature('EXECUTIONS')
export class ExecutionController {
  public constructor(private readonly useCases: ExecutionOrchestrationUseCases) {}

  @Get()
  @ApiOperation({ summary: 'List recent executions' })
  @ApiOkResponse({ type: ExecutionResponseDto, isArray: true })
  public async list(): Promise<readonly ExecutionResponseDto[]> {
    const executions = await this.useCases.list();
    return executions.map((execution) => ExecutionResponseDto.from(execution));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single execution' })
  @ApiOkResponse({ type: ExecutionResponseDto })
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ExecutionResponseDto> {
    const execution = await this.useCases.get(id);
    return ExecutionResponseDto.from(execution);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request cancellation of an in-flight execution' })
  @ApiOkResponse({ type: ExecutionResponseDto })
  public async cancel(@Param('id', new ParseUUIDPipe()) id: string): Promise<ExecutionResponseDto> {
    const execution = await this.useCases.cancel(id);
    return ExecutionResponseDto.from(execution);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Read the secret-redacted execution log' })
  @ApiOkResponse({ type: ExecutionLogResponseDto })
  public async logs(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ExecutionLogResponseDto> {
    const log = await this.useCases.getLogs(id);
    return ExecutionLogResponseDto.from(log);
  }

  @Sse(':id/events')
  @ApiOperation({
    summary: 'Stream execution progress as Server-Sent Events until a terminal status',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ type: ExecutionEventDto })
  public events(@Param('id', new ParseUUIDPipe()) id: string): Observable<MessageEvent> {
    return interval(MIN_STREAM_INTERVAL_MS).pipe(
      startWith(-1),
      concatMap(() => from(this.useCases.get(id))),
      distinctUntilChanged(
        (previous, next) =>
          previous.status === next.status && previous.updatedAt === next.updatedAt,
      ),
      takeWhile((view) => !isTerminalStatus(view.status), true),
      map((view) => ({ data: ExecutionEventDto.from(view) }) satisfies MessageEvent),
    );
  }
}
