import {
  Body,
  Controller,
  Get,
  HttpCode,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import { from, interval, type Observable } from 'rxjs';
import { concatMap, map, takeWhile } from 'rxjs/operators';

import { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';
import { SubmitSqlExecutionRequestDto } from '@presentation/query-workbench/sql-execution.dto';
import {
  SqlExecutionAcceptedResponseDto,
  SqlExecutionDetailResponseDto,
  SqlExecutionEventResponseDto,
  SqlExecutionSummaryResponseDto,
} from '@presentation/query-workbench/sql-execution.response';

const HTTP_ACCEPTED = 202;
// Progress is delivered by polling the durable projection at a fixed cadence.
const EVENT_POLL_INTERVAL_MS = 1_000;

@ApiTags('sql-executions')
@Controller('sql-executions')
@RequireWorkspaceFeature('QUERY')
export class SqlExecutionController {
  public constructor(private readonly useCases: QueryWorkbenchUseCases) {}

  @Post()
  @HttpCode(HTTP_ACCEPTED)
  @ApiOperation({ summary: 'Submit a read-only SQL statement for asynchronous execution' })
  @ApiAcceptedResponse({ type: SqlExecutionAcceptedResponseDto })
  public async submit(
    @Body() request: SubmitSqlExecutionRequestDto,
  ): Promise<SqlExecutionAcceptedResponseDto> {
    const accepted = await this.useCases.submit({
      sql: request.sql,
      catalog: request.catalog,
      namespace: request.namespace,
    });
    return SqlExecutionAcceptedResponseDto.from(accepted);
  }

  @Get()
  @ApiOperation({ summary: 'List SQL execution history (most recent first)' })
  @ApiOkResponse({ type: SqlExecutionSummaryResponseDto, isArray: true })
  public async list(): Promise<readonly SqlExecutionSummaryResponseDto[]> {
    const executions = await this.useCases.listHistory();
    return executions.map((execution) => SqlExecutionSummaryResponseDto.from(execution));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a SQL execution with status, columns, capped rows, statistics, and failure',
  })
  @ApiOkResponse({ type: SqlExecutionDetailResponseDto })
  public async get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SqlExecutionDetailResponseDto> {
    const execution = await this.useCases.get(id);
    return SqlExecutionDetailResponseDto.from(execution);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Request cancellation of a running SQL execution' })
  @ApiOkResponse({ type: SqlExecutionDetailResponseDto })
  public async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SqlExecutionDetailResponseDto> {
    const execution = await this.useCases.cancel(id);
    return SqlExecutionDetailResponseDto.from(execution);
  }

  @Sse(':id/events')
  @ApiOperation({
    summary: 'Stream SQL execution status/progress updates until the query terminates',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ type: SqlExecutionEventResponseDto })
  public streamEvents(@Param('id', new ParseUUIDPipe()) id: string): Observable<MessageEvent> {
    return interval(EVENT_POLL_INTERVAL_MS).pipe(
      concatMap(() => from(this.useCases.getEvent(id))),
      takeWhile((event) => !event.finished, true),
      map((event): MessageEvent => ({
        type: 'sql-execution',
        data: SqlExecutionEventResponseDto.from(event),
      })),
    );
  }
}
