import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { SqlExecution } from '@domain/query-workbench/aggregates/sql-execution';
import { SqlExecutionError } from '@domain/query-workbench/errors/sql-execution.errors';
import {
  lintSql,
  type SqlLintFinding,
} from '@domain/query-workbench/policies/sql-correctness.linter';
import { suggestValueCorrections } from '@domain/query-workbench/policies/value-suggestion.linter';
import type { IColumnProfileCache } from '@application/catalog-exploration/interfaces/i-column-profile-cache';
import type { QueryStatusValue } from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import {
  QueryContext,
  SqlExecutionId,
  SqlStatement,
  isTerminalQueryStatus,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import type { QueryExecutionRunner } from '@application/query-workbench/query-execution.runner';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IQueryResultStore } from '@application/query-workbench/interfaces/i-query-result-store';
import type { ISqlExecutionReader } from '@application/query-workbench/interfaces/i-sql-execution-reader';
import type { ISqlExecutionRepository } from '@application/query-workbench/interfaces/i-sql-execution-repository';
import { toSqlExecutionOutboxMessage } from '@application/query-workbench/sql-execution-outbox.mapper';
import type {
  SqlExecutionDetailView,
  SqlExecutionEventView,
  SqlExecutionSummaryView,
} from '@application/query-workbench/read-models/sql-execution.view';
import type { CatalogAccessAuthorizer } from '@application/catalog-exploration/catalog-access-authorizer';
import { CatalogAccessDeniedError } from '@application/catalog-exploration/catalog-access-authorizer';
import type {
  IQueryTargetResolver,
  IQueryTargetMetadata,
} from './interfaces/i-query-target-resolver';
import type { CatalogResourceRef } from '@application/administration/catalog-authorization';

export interface SubmitQueryCommand {
  readonly sql: string;
  readonly catalog?: string;
  readonly namespace?: string | null;
}

// A no-op cache (always misses) so callers that don't need value-suggestion
// warnings — tests, or a future consumer without a shared cache — don't have
// to wire one. Mirrors CatalogExplorationUseCases's identical default.
const EMPTY_COLUMN_PROFILE_CACHE: IColumnProfileCache = {
  get: () => undefined,
  set: () => undefined,
};

export interface SubmittedQueryView {
  readonly id: string;
  readonly status: QueryStatusValue;
  /**
   * Advisory correctness findings for the submitted SQL (Requirement: query
   * correctness linter). Never blocks submission — an agent caller can
   * surface these to self-correct, but execution always proceeds regardless
   * of what's found here.
   */
  readonly warnings: readonly string[];
}

/**
 * Application service for the Query Workbench context.
 *
 * Submission is synchronous only up to durably queueing the execution; the
 * actual query runs asynchronously via {@link QueryExecutionRunner} so the HTTP
 * request returns immediately with 202 Accepted (Requirements 5.1, 5.3). All
 * read models expose durable metadata plus, when still available in this API
 * process, the capped result rows (Requirement 5.7).
 */
export class QueryWorkbenchUseCases {
  public get configuredCatalog(): string {
    return this.defaultCatalog;
  }

  public constructor(
    private readonly repository: ISqlExecutionRepository,
    private readonly reader: ISqlExecutionReader,
    private readonly resultStore: IQueryResultStore,
    private readonly runner: QueryExecutionRunner,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly defaultCatalog: string,
    private readonly authorizer: CatalogAccessAuthorizer,
    private readonly targets: IQueryTargetResolver,
    private readonly metadata: IQueryTargetMetadata,
    private readonly columnProfileCache: IColumnProfileCache = EMPTY_COLUMN_PROFILE_CACHE,
  ) {}

  /**
   * Validates the read-only policy, durably queues the execution together with
   * a submission outbox event, then hands off asynchronous execution to the
   * background runner.
   */
  public async submit(command: SubmitQueryCommand): Promise<SubmittedQueryView> {
    const statement = SqlStatement.create(command.sql);
    // Fail fast on writes/DDL/DCL and multi-statement input before persisting.
    statement.assertReadOnly();
    // Advisory only: never blocks submission, just surfaced to the caller.
    const lintFindings: readonly SqlLintFinding[] = lintSql(command.sql);
    const context = QueryContext.create(command.catalog ?? this.defaultCatalog, command.namespace);
    const targets = this.targets.resolve(statement, context);
    // Advisory only, same as lintFindings: only fires for tables already
    // profiled (via the profile_table MCP tool) and cached — never triggers
    // a fresh profile just to lint (Requirement: 01, "grounding via
    // summarized stats").
    const profiledColumns = targets.flatMap(
      (target) =>
        this.columnProfileCache.get(`${target.catalog}.${target.schema}.${target.table}`) ?? [],
    );
    const valueSuggestions = suggestValueCorrections(command.sql, profiledColumns);
    const hierarchy: CatalogResourceRef[] = [
      { type: 'CATALOG' as const, id: context.catalog },
      ...(context.namespace === undefined
        ? []
        : [{ type: 'SCHEMA' as const, id: `${context.catalog}.${context.namespace}` }]),
    ];
    if (targets.length === 0) await this.requireSelect(hierarchy);
    for (const target of targets) {
      const databaseId = `${target.catalog}.${target.schema}`;
      const tableId = `${databaseId}.${target.table}`;
      const targetHierarchy: CatalogResourceRef[] = [
        { type: 'CATALOG', id: target.catalog },
        { type: 'DATABASE', id: databaseId },
        { type: 'SCHEMA', id: databaseId },
        { type: 'TABLE', id: tableId },
      ];
      await this.requireSelect(targetHierarchy);
      // Conservatively honor every column denial until precise column lineage
      // is implemented. A column DENY must not disappear behind SELECT *.
      for (const column of await this.metadata.columns(target)) {
        const decision = await this.authorizer.authorizeCatalog('SELECT', [
          ...targetHierarchy,
          { type: 'COLUMN', id: `${tableId}.${column}` },
        ]);
        if (decision.reason === 'EXPLICIT_DENY')
          throw new CatalogAccessDeniedError(decision.reason);
      }
    }
    const id = SqlExecutionId.from(this.idGenerator.next());
    const execution = SqlExecution.queue(
      { id, statement, context, queuedAt: this.clock.now() },
      this.idGenerator.next(),
    );
    await this.unitOfWork.commit(async (events) => {
      await this.repository.create(execution);
      events.record(...execution.pullDomainEvents().map(toSqlExecutionOutboxMessage));
    });

    this.runner.schedule(id);
    return {
      id: id.value,
      status: execution.status.value,
      warnings: [
        ...lintFindings.map((finding) => finding.message),
        ...valueSuggestions.map((finding) => finding.message),
      ],
    };
  }

  public listHistory(): Promise<readonly SqlExecutionSummaryView[]> {
    return this.reader.listHistory();
  }

  private async requireSelect(hierarchy: readonly CatalogResourceRef[]): Promise<void> {
    const decision = await this.authorizer.authorizeCatalog('SELECT', hierarchy);
    if (!decision.allowed) throw new CatalogAccessDeniedError(decision.reason);
  }

  public async get(idValue: string): Promise<SqlExecutionDetailView> {
    const id = SqlExecutionId.from(idValue);
    return this.requireDetail(id.value);
  }

  public async getEvent(idValue: string): Promise<SqlExecutionEventView> {
    const id = SqlExecutionId.from(idValue);
    const detail = await this.requireDetail(id.value);
    return {
      id: detail.id,
      status: detail.status,
      finished: isTerminalQueryStatus(detail.status),
      progressPercentage: detail.statistics?.progressPercentage,
      state: detail.statistics?.state,
      rowCount: detail.rowCount,
      errorCode: detail.failure?.code,
      updatedAt: detail.updatedAt,
    };
  }

  /**
   * Requests cancellation and returns the current view. Cancellation is applied
   * asynchronously by the runner (send DELETE to Trino, persist terminal
   * state), so the returned status may still be CANCELLING (Requirement 5.5).
   */
  public async cancel(idValue: string): Promise<SqlExecutionDetailView> {
    const id = SqlExecutionId.from(idValue);
    const execution = await this.repository.findById(id);
    if (execution === undefined) {
      throw SqlExecutionError.notFound();
    }
    await this.runner.requestCancel(id);
    return this.requireDetail(id.value);
  }

  private async requireDetail(idValue: string): Promise<SqlExecutionDetailView> {
    const detail = await this.reader.findById(idValue);
    if (detail === undefined) {
      throw SqlExecutionError.notFound();
    }
    const stored = this.resultStore.get(idValue);
    if (stored === undefined) {
      return detail;
    }
    return {
      ...detail,
      columns: detail.columns.length > 0 ? detail.columns : stored.columns,
      rows: stored.rows,
      truncated: stored.truncated,
      resultsAvailable: true,
    };
  }
}
