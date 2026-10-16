import type { ChartActor } from '@application/chart/chart-authoring.use-cases';
import type { ChartRunRegistry } from '@application/chart/chart-run.registry';
import type { ChartRunEvent, ChartRunLimits } from '@application/chart/chart-query.executor';
import type { IAnalyticalQueryExecutor } from '@application/chart/interfaces/i-analytical-query-executor';
import type { ICanonicalChartRepository } from '@application/chart/interfaces/i-chart.repository';
import type { IChartCatalog } from '@application/chart/interfaces/i-chart-catalog';
import type { INativeChartQueryPolicy } from '@application/chart/interfaces/i-native-chart-query-policy';
import type { VisualQueryCompiler } from '@application/chart/query/visual-query.compiler';
import type { CompiledChartQuery } from '@application/chart/query/compiled-chart-query';
import {
  validateQueryDefinition,
  type QueryDefinition,
} from '@domain/chart/models/query-definition';
import { ChartError } from '@domain/chart/errors/chart.errors';
import {
  validateVisualizationDefinition,
  type OutputColumn,
  type VisualizationDefinition,
} from '@domain/chart/models/visualization-definition';
import {
  QueryContext,
  SqlStatement,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import type { IQueryTargetResolver } from '@application/query-workbench/interfaces/i-query-target-resolver';
import type { CollectionAuthorizationService } from '@application/chart-collection/collection-authorization.service';

export interface PreparedChartQuery {
  readonly compiled: CompiledChartQuery;
}

export interface TransientChartDraft {
  readonly title: string;
  readonly description?: string | null;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly outputSchema: readonly OutputColumn[];
  readonly parameterValues?: Readonly<Record<string, unknown>>;
}

export interface PreviewChartDraftInput {
  readonly actor: ChartActor;
  readonly draft: TransientChartDraft;
  readonly parameterValues?: Readonly<Record<string, unknown>>;
}

export interface PreviewChartQueryInput {
  readonly actor: ChartActor;
  readonly queryDefinition: QueryDefinition;
  readonly parameterValues?: Readonly<Record<string, unknown>>;
}

export type CompileChartQueryInput = PreviewChartQueryInput;

/** Application orchestration for preview and saved-chart runtime execution. */
export class ChartRuntimeUseCases {
  public constructor(
    private readonly repository: ICanonicalChartRepository,
    private readonly visualCompiler: VisualQueryCompiler,
    private readonly nativePolicy: INativeChartQueryPolicy,
    private readonly targetResolver: IQueryTargetResolver,
    private readonly catalog: IChartCatalog,
    private readonly executor: IAnalyticalQueryExecutor,
    private readonly registry: ChartRunRegistry,
    private readonly previewLimits: ChartRunLimits = { maxRows: 1_000, maxBytes: 10 * 1024 * 1024 },
    private readonly runtimeLimits: ChartRunLimits = {
      maxRows: 10_000,
      maxBytes: 10 * 1024 * 1024,
    },
    private readonly collections?: CollectionAuthorizationService,
  ) {}

  public async prepareAuthorizedQuery(
    actor: ChartActor,
    definition: QueryDefinition,
    parameterValues: Readonly<Record<string, unknown>> = {},
  ): Promise<PreparedChartQuery> {
    validateQueryDefinition(definition);
    const compiled =
      definition.mode === 'VISUAL'
        ? this.visualCompiler.compile(definition)
        : await this.nativePolicy.validateAndCompile(
            definition.sql,
            definition.context,
            definition.parameters,
            parameterValues,
          );
    // Native policy extracts the AST relation set; visual compilation already
    // carries trusted TableRefs. Keep the legacy resolver as a defensive second
    // parser only for native statements and fail closed on disagreement.
    if (definition.mode === 'NATIVE') {
      const resolved = this.targetResolver.resolve(
        SqlStatement.create(compiled.sql),
        QueryContext.create(definition.context.catalog, definition.context.schema),
      );
      if (resolved.length !== compiled.relations.length) {
        throw ChartError.statementForbidden(
          'The native SQL relation set changed during validation.',
        );
      }
    }
    await this.catalog.resolveAndAuthorize({
      actor,
      relations: compiled.relations,
    });
    return { compiled };
  }

  /** Compiles and authorizes a query without executing or persisting it. */
  public async compileQuery(input: CompileChartQueryInput): Promise<CompiledChartQuery> {
    const prepared = await this.prepareAuthorizedQuery(
      input.actor,
      input.queryDefinition,
      input.parameterValues ?? {},
    );
    return prepared.compiled;
  }

  public async previewChartDraft(input: PreviewChartDraftInput): Promise<{
    readonly runId: string;
    readonly stream: AsyncIterable<ChartRunEvent>;
  }> {
    const prepared = await this.prepareAuthorizedQuery(
      input.actor,
      input.draft.queryDefinition,
      effectiveParameterValues(input.draft, input.parameterValues),
    );
    // Chat-to-Chart may not know the output schema until Trino returns its
    // COLUMNS event. Manual drafts normally provide it from the query preview.
    if (input.draft.outputSchema.length > 0) {
      validateVisualizationDefinition(
        input.draft.visualizationDefinition,
        input.draft.outputSchema,
      );
    }
    const registered = this.registry.register();
    const stream = this.withValidatedPreview(
      input,
      this.executor.execute(
        prepared.compiled,
        this.previewLimits,
        registered.signal,
        registered.runId,
      ),
      registered.runId,
    );
    return { runId: registered.runId, stream };
  }

  /** Runs only the query notebook without validating visualization bindings. */
  public async previewQuery(input: PreviewChartQueryInput): Promise<{
    readonly runId: string;
    readonly stream: AsyncIterable<ChartRunEvent>;
  }> {
    const prepared = await this.prepareAuthorizedQuery(
      input.actor,
      input.queryDefinition,
      input.parameterValues ?? {},
    );
    const registered = this.registry.register();
    return {
      runId: registered.runId,
      stream: this.executor.execute(
        prepared.compiled,
        this.previewLimits,
        registered.signal,
        registered.runId,
      ),
    };
  }

  public async runSavedChart(
    actor: ChartActor,
    chartId: string,
    parameterValues: Readonly<Record<string, unknown>> = {},
  ): Promise<{ readonly runId: string; readonly stream: AsyncIterable<ChartRunEvent> }> {
    const saved = await this.repository.findCanonicalById(actor.organizationId, chartId);
    if (saved === null) throw ChartError.notFound(chartId);
    if (this.collections && saved.chart.collectionId) {
      await this.collections.requireAccess(
        saved.chart.collectionId,
        {
          organizationId: actor.organizationId,
          identityId: actor.identityId,
          isOrganizationAdmin: actor.isOrganizationAdmin === true,
        },
        'VIEW',
      );
    }
    const prepared = await this.prepareAuthorizedQuery(
      actor,
      saved.revision.queryDefinition,
      parameterValues,
    );
    const registered = this.registry.register();
    return {
      runId: registered.runId,
      stream: this.executor.execute(
        prepared.compiled,
        this.runtimeLimits,
        registered.signal,
        registered.runId,
      ),
    };
  }

  public cancelChartRun(runId: string): boolean {
    return this.registry.cancel(runId);
  }

  private async *withValidatedPreview(
    input: PreviewChartDraftInput,
    source: AsyncIterable<ChartRunEvent>,
    runId: string,
  ): AsyncIterable<ChartRunEvent> {
    let columns: readonly OutputColumn[] = input.draft.outputSchema;
    let schemaMismatch = false;
    let visualizationError: ChartError | null = null;
    try {
      for await (const event of source) {
        if (event.type === 'COLUMNS') {
          columns = event.columns;
          if (
            input.draft.outputSchema.length > 0 &&
            JSON.stringify(input.draft.outputSchema) !== JSON.stringify(event.columns)
          ) {
            schemaMismatch = true;
          }
          try {
            validateVisualizationDefinition(input.draft.visualizationDefinition, columns);
          } catch (error: unknown) {
            visualizationError =
              error instanceof ChartError
                ? error
                : ChartError.bindingInvalid('The visualization does not match the query output.');
          }
        }
        if (event.type === 'SUCCEEDED' && !event.truncated) {
          if (columns.length === 0) {
            try {
              validateVisualizationDefinition(input.draft.visualizationDefinition, columns);
            } catch (error: unknown) {
              visualizationError =
                error instanceof ChartError
                  ? error
                  : ChartError.bindingInvalid('The visualization does not match the query output.');
            }
          }
          if (schemaMismatch || visualizationError) {
            const failure =
              visualizationError ?? ChartError.bindingInvalid('Query output schema changed.');
            yield { type: 'FAILED', code: failure.code, message: failure.message };
            return;
          }
          yield event;
        } else {
          yield event;
        }
      }
    } finally {
      this.registry.complete(runId);
    }
  }
}

function effectiveParameterValues(
  draft: Pick<TransientChartDraft, 'parameterValues'>,
  explicit: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  return explicit ?? draft.parameterValues ?? {};
}
