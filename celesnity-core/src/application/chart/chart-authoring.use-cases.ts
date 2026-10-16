import { ChartError } from '@domain/chart/errors/chart.errors';
import { createHash } from 'node:crypto';
import type { Chart, ChartRevision } from '@domain/chart/models/chart';
import {
  validateQueryDefinition,
  type QueryDefinition,
} from '@domain/chart/models/query-definition';
import type {
  OutputColumn,
  VisualizationDefinition,
} from '@domain/chart/models/visualization-definition';
import { validateVisualizationDefinition } from '@domain/chart/models/visualization-definition';
import type { ICanonicalChartRepository } from '@application/chart/interfaces/i-chart.repository';
import type { CollectionPrincipal } from '@domain/chart-collection/models/chart-collection';
import type { CollectionAuthorizationService } from '@application/chart-collection/collection-authorization.service';

export interface ChartActor {
  readonly organizationId: string;
  readonly identityId: string;
  readonly isOrganizationAdmin?: boolean;
}

export interface ChartDraft {
  readonly title: string;
  readonly description?: string | null;
  readonly collectionId: string;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly outputSchema: readonly OutputColumn[];
  /** Runtime parameter values are used when previewing or running the draft. */
  readonly parameterValues?: Readonly<Record<string, unknown>>;
  /** Core derives this for Chat-to-Chart; browser drafts default to MANUAL. */
  readonly provenance?: 'MANUAL' | 'CHAT';
}

export interface CreateChartInput {
  readonly actor: ChartActor;
  readonly draft: ChartDraft;
}

export class ChartAuthoringUseCases {
  public constructor(
    private readonly repository: ICanonicalChartRepository,
    private readonly ids: { next(): string },
    private readonly clock: { now(): Date },
    private readonly collections?: CollectionAuthorizationService,
  ) {}

  public async createChart(
    input: CreateChartInput,
  ): Promise<{ readonly chart: Chart; readonly revision: ChartRevision }> {
    this.validateDraft(input);
    await this.requireCollectionCurate(input.actor, input.draft.collectionId);
    const now = this.clock.now().toISOString();
    const chart: Chart = {
      id: this.ids.next(),
      runId: null,
      chartType: 'canonical',
      encodings: {},
      data: [],
      config: {},
      vlSpec: null,
      sql: null,
      status: 'ready',
      errorMessage: null,
      version: 1,
      organizationId: input.actor.organizationId,
      collectionId: input.draft.collectionId,
      ownerIdentityId: input.actor.identityId,
      title: input.draft.title,
      description: input.draft.description ?? null,
      provenance: input.draft.provenance ?? 'MANUAL',
      currentRevisionNumber: 1,
      legacyState: 'NONE',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const revision: ChartRevision = {
      id: this.ids.next(),
      chartId: chart.id,
      revisionNumber: 1,
      queryDefinition: input.draft.queryDefinition,
      visualizationDefinition: input.draft.visualizationDefinition,
      outputSchema: input.draft.outputSchema,
      queryHash: createHash('sha256')
        .update(JSON.stringify(input.draft.queryDefinition))
        .digest('hex'),
      createdByIdentityId: input.actor.identityId,
      createdAt: now,
      restoredFromRevisionNumber: null,
    };
    return this.repository.createCanonical({ chart, revision });
  }

  public async updateChartFromDraft(input: {
    readonly actor: ChartActor;
    readonly chartId: string;
    readonly expectedRevision: number;
    readonly draft: ChartDraft;
  }): Promise<{ readonly chart: Chart; readonly revision: ChartRevision }> {
    this.validateDraft(input);
    const existing = await this.repository.findCanonicalById(
      input.actor.organizationId,
      input.chartId,
    );
    if (existing === null) throw ChartError.notFound(input.chartId);
    await this.requireCollectionCurate(input.actor, existing.chart.collectionId);
    await this.requireCollectionCurate(input.actor, input.draft.collectionId);
    if (existing.chart.currentRevisionNumber !== input.expectedRevision) {
      throw ChartError.versionConflict();
    }
    const now = this.clock.now().toISOString();
    const revisionNumber = input.expectedRevision + 1;
    const revision: ChartRevision = {
      id: this.ids.next(),
      chartId: existing.chart.id,
      revisionNumber,
      queryDefinition: input.draft.queryDefinition,
      visualizationDefinition: input.draft.visualizationDefinition,
      outputSchema: input.draft.outputSchema,
      queryHash: createHash('sha256')
        .update(JSON.stringify(input.draft.queryDefinition))
        .digest('hex'),
      createdByIdentityId: input.actor.identityId,
      createdAt: now,
      restoredFromRevisionNumber: null,
    };
    const chart: Chart = {
      ...existing.chart,
      title: input.draft.title,
      description: input.draft.description ?? null,
      collectionId: input.draft.collectionId,
      currentRevisionNumber: revisionNumber,
      updatedAt: now,
    };
    const saved = await this.repository.updateCanonical({
      chart,
      revision,
      expectedRevisionNumber: input.expectedRevision,
    });
    if (saved === null) throw ChartError.versionConflict();
    return saved;
  }

  public async saveChartAsNew(
    input: CreateChartInput,
  ): Promise<{ readonly chart: Chart; readonly revision: ChartRevision }> {
    return this.createChart(input);
  }

  public async getChart(
    organizationId: string,
    chartId: string,
    actor?: ChartActor,
  ): Promise<{
    readonly chart: Chart;
    readonly revision: ChartRevision;
  }> {
    const found = await this.repository.findCanonicalById(organizationId, chartId);
    if (found === null) throw ChartError.notFound(chartId);
    await this.requireCollectionView(actor, found.chart.collectionId);
    return found;
  }

  public async listCharts(input: {
    readonly organizationId: string;
    readonly actor?: ChartActor;
    readonly collectionId?: string;
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<readonly Chart[]> {
    const charts = await this.repository.listCanonical({
      ...input,
      limit: Math.min(Math.max(input.limit ?? 50, 1), 200),
    });
    if (!this.collections) return charts;
    const visible: Chart[] = [];
    for (const chart of charts) {
      try {
        await this.requireCollectionView(input.actor, chart.collectionId);
        visible.push(chart);
      } catch {
        // Listing is intentionally filtered rather than leaking collection
        // membership through a forbidden chart.
      }
    }
    return visible;
  }

  public async listRevisions(
    organizationId: string,
    chartId: string,
    actor?: ChartActor,
  ): Promise<readonly ChartRevision[]> {
    const current = await this.repository.findCanonicalById(organizationId, chartId);
    if (current === null) throw ChartError.notFound(chartId);
    await this.requireCollectionView(actor, current.chart.collectionId);
    return this.repository.listRevisions(organizationId, chartId);
  }

  public async restoreChartRevision(input: {
    readonly actor: ChartActor;
    readonly chartId: string;
    readonly revisionNumber: number;
    readonly expectedRevision: number;
  }): Promise<{ readonly chart: Chart; readonly revision: ChartRevision }> {
    const existing = await this.repository.findCanonicalById(
      input.actor.organizationId,
      input.chartId,
    );
    if (existing === null) throw ChartError.notFound(input.chartId);
    await this.requireCollectionCurate(input.actor, existing.chart.collectionId);
    if (existing.chart.currentRevisionNumber !== input.expectedRevision) {
      throw ChartError.versionConflict();
    }
    const revisions = await this.repository.listRevisions(
      input.actor.organizationId,
      input.chartId,
    );
    const target = revisions.find((revision) => revision.revisionNumber === input.revisionNumber);
    if (target === undefined) {
      throw ChartError.notFound(`revision ${input.revisionNumber}`);
    }
    const now = this.clock.now().toISOString();
    const revision: ChartRevision = {
      id: this.ids.next(),
      chartId: existing.chart.id,
      revisionNumber: input.expectedRevision + 1,
      queryDefinition: target.queryDefinition,
      visualizationDefinition: target.visualizationDefinition,
      outputSchema: target.outputSchema,
      queryHash: target.queryHash,
      createdByIdentityId: input.actor.identityId,
      createdAt: now,
      restoredFromRevisionNumber: target.revisionNumber,
    };
    const chart: Chart = {
      ...existing.chart,
      currentRevisionNumber: revision.revisionNumber,
      updatedAt: now,
    };
    const restored = await this.repository.restoreRevision({
      chart,
      revision,
      expectedRevisionNumber: input.expectedRevision,
    });
    if (restored === null) throw ChartError.versionConflict();
    return restored;
  }

  public async moveChart(input: {
    readonly actor: ChartActor;
    readonly chartId: string;
    readonly collectionId: string;
  }): Promise<Chart> {
    const existing = await this.repository.findCanonicalById(
      input.actor.organizationId,
      input.chartId,
    );
    if (existing === null) throw ChartError.notFound(input.chartId);
    await this.requireCollectionCurate(input.actor, existing.chart.collectionId);
    await this.requireCollectionCurate(input.actor, input.collectionId);
    const moved = await this.repository.moveCanonical(
      input.actor.organizationId,
      input.chartId,
      input.collectionId,
      this.clock.now().toISOString(),
    );
    if (moved === null) throw ChartError.notFound(input.chartId);
    return moved;
  }

  public async archiveChart(input: {
    readonly actor: ChartActor;
    readonly chartId: string;
  }): Promise<Chart> {
    const existing = await this.repository.findCanonicalById(
      input.actor.organizationId,
      input.chartId,
    );
    if (existing === null) throw ChartError.notFound(input.chartId);
    await this.requireCollectionCurate(input.actor, existing.chart.collectionId);
    const archived = await this.repository.archiveCanonical(
      input.actor.organizationId,
      input.chartId,
      this.clock.now().toISOString(),
    );
    if (archived === null) throw ChartError.notFound(input.chartId);
    return archived;
  }

  private validateDraft(
    input:
      | CreateChartInput
      | {
          readonly draft: ChartDraft;
        },
  ): void {
    const draft = input?.draft;
    try {
      validateQueryDefinition(draft.queryDefinition);
      validateVisualizationDefinition(draft.visualizationDefinition, draft.outputSchema);
    } catch (error) {
      if (error instanceof ChartError) throw error;
      throw ChartError.queryInvalid('The chart draft is invalid.');
    }
    if (!draft.title.trim() || !draft.collectionId.trim())
      throw ChartError.queryInvalid('Chart title and collection are required.');
  }

  private async requireCollectionCurate(
    actor: ChartActor,
    collectionId: string | null | undefined,
  ): Promise<void> {
    if (!this.collections) return;
    if (!collectionId) throw ChartError.authorizationDenied();
    const principal: CollectionPrincipal = {
      organizationId: actor.organizationId,
      identityId: actor.identityId,
      isOrganizationAdmin: actor.isOrganizationAdmin === true,
    };
    await this.collections.requireAccess(collectionId, principal, 'CURATE');
  }

  private async requireCollectionView(
    actor: ChartActor | undefined,
    collectionId: string | null | undefined,
  ): Promise<void> {
    if (!this.collections || !actor) return;
    if (!collectionId) throw ChartError.authorizationDenied();
    await this.collections.requireAccess(
      collectionId,
      {
        organizationId: actor.organizationId,
        identityId: actor.identityId,
        isOrganizationAdmin: actor.isOrganizationAdmin === true,
      },
      'VIEW',
    );
  }
}
