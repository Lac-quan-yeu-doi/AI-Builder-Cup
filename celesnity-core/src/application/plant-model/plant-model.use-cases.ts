import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IPlantModelRepository } from './interfaces/i-plant-model.repository';
import { DEFAULT_PLANT_REFERENCE_DATA, PLANT_MODEL_TEMPLATES } from './plant-model.templates';
import { PlantModelError } from '@domain/plant-model/errors/plant-model.errors';
import type {
  PlantModelDraft,
  PlantDashboardAssociation,
  PlantDashboardRole,
  PlantModelTemplate,
  PlantModelVersion,
  PlantNode,
  PlantNodeType,
  PlantRelationship,
  PlantPropertyDefinition,
  PlantReferenceData,
  PlantSite,
  PlantSiteSummary,
  PlantVersionChange,
  PlantVersionDiff,
} from '@domain/plant-model/models/plant-model';
import { EMPTY_PLANT_MODEL } from '@domain/plant-model/models/plant-model';
import { validatePlantDraft } from '@domain/plant-model/plant-model.validator';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { PlantCatalogLookupUseCases } from './plant-catalog-lookup.use-cases';

export class PlantModelUseCases {
  public constructor(
    private readonly repository: IPlantModelRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly contexts: AuthenticatedContextStore,
    private readonly catalogLookups: PlantCatalogLookupUseCases,
  ) {}

  public async listSites(): Promise<readonly PlantSiteSummary[]> {
    return (await this.repository.list()).map(summary);
  }

  public async createSite(input: {
    readonly name: string;
    readonly code: string;
    readonly timezone?: string;
  }): Promise<PlantSite> {
    const now = this.clock.now().toISOString();
    const site: PlantSite = {
      id: this.ids.next(),
      name: cleanText(input.name, 'Plant name', 160),
      code: cleanCode(input.code),
      timezone: cleanText(input.timezone ?? 'Asia/Ho_Chi_Minh', 'Timezone', 80),
      draft: EMPTY_PLANT_MODEL,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    if (!(await this.repository.create(site, DEFAULT_PLANT_REFERENCE_DATA)))
      throw PlantModelError.nameConflict();
    return site;
  }

  public async getSite(id: string): Promise<PlantSite> {
    const site = await this.repository.find(id);
    if (site === undefined) throw PlantModelError.notFound();
    return site;
  }

  /**
   * Bounded read models for agent navigation. The draft is currently stored as
   * one validated JSON document, so these reads still load that document in
   * Core, but they never expose the complete graph to the model in one call.
   */
  public async listNodes(
    siteId: string,
    input: {
      readonly query?: string;
      readonly nodeTypeId?: string;
      readonly routingRole?: string;
      readonly offset?: number;
      readonly limit?: number;
    },
  ): Promise<{
    readonly site: PlantSiteSummary;
    readonly nodes: readonly PlantNodeSummary[];
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasMore: boolean;
  }> {
    const site = await this.getSite(siteId);
    const nodeTypes = new Map(site.draft.nodeTypes.map((value) => [value.id, value]));
    const query = input.query?.trim().toLocaleLowerCase();
    const offset = boundedInteger(input.offset, 0, 10_000, 0);
    const limit = boundedInteger(input.limit, 1, 100, 25);
    const nodes = [...site.draft.nodes]
      .filter((node) => input.nodeTypeId === undefined || node.nodeTypeId === input.nodeTypeId)
      .filter((node) => input.routingRole === undefined || node.routingRole === input.routingRole)
      .filter((node) => {
        if (query === undefined || query === '') return true;
        return (
          node.name.toLocaleLowerCase().includes(query) ||
          nodeTypes.get(node.nodeTypeId)?.name.toLocaleLowerCase().includes(query) === true
        );
      })
      .sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      );
    return {
      site: summary(site),
      nodes: nodes
        .slice(offset, offset + limit)
        .map((node) => nodeSummary(node, nodeTypes, site.draft.relationships)),
      offset,
      limit,
      total: nodes.length,
      hasMore: offset + limit < nodes.length,
    };
  }

  public async getNode(siteId: string, nodeId: string): Promise<PlantNodeDetail> {
    const site = await this.getSite(siteId);
    const node = site.draft.nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) throw PlantModelError.notFound('The plant model node was not found.');
    const nodeTypes = new Map(site.draft.nodeTypes.map((value) => [value.id, value]));
    const type = nodeTypes.get(node.nodeTypeId);
    const definitions = [...(type?.properties ?? []), ...node.localProperties].sort(
      (left, right) => left.order - right.order,
    );
    const nodes = new Map(site.draft.nodes.map((value) => [value.id, value]));
    const relationships = site.draft.relationships.filter(
      (relationship) =>
        relationship.sourceNodeId === nodeId || relationship.targetNodeId === nodeId,
    );
    return {
      ...nodeSummary(node, nodeTypes, site.draft.relationships),
      properties: definitions.map((definition) => ({
        id: definition.id,
        key: definition.key,
        name: definition.name,
        type: definition.type,
        required: definition.required,
        value: node.values[definition.id] ?? null,
        ...(definition.description === undefined ? {} : { description: definition.description }),
        ...(definition.options === undefined ? {} : { options: definition.options }),
        ...(definition.catalogBinding === undefined
          ? {}
          : { catalogBinding: definition.catalogBinding }),
        local: node.localProperties.some((candidate) => candidate.id === definition.id),
      })),
      relationships: relationships.map((relationship) => relationshipDetail(relationship, nodes)),
    };
  }

  public async resolveNodeCatalogProperty(
    siteId: string,
    nodeId: string,
    propertyDefinitionId: string,
  ): Promise<Readonly<Record<string, unknown>>> {
    const site = await this.getSite(siteId);
    const node = site.draft.nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) throw PlantModelError.notFound('The plant model node was not found.');
    const type = site.draft.nodeTypes.find(({ id }) => id === node.nodeTypeId);
    const definition = [...(type?.properties ?? []), ...node.localProperties].find(
      ({ id }) => id === propertyDefinitionId,
    );
    if (definition === undefined) {
      throw PlantModelError.notFound('The plant model property was not found.');
    }
    if (definition.type !== 'catalog-scalar' || definition.catalogBinding === undefined) {
      throw PlantModelError.validation('Only live catalog value properties can be resolved.');
    }
    return {
      siteId,
      nodeId,
      nodeName: node.name,
      propertyDefinitionId: definition.id,
      propertyName: definition.name,
      resolution: await this.catalogLookups.resolve(definition.catalogBinding, node.values),
    };
  }

  public async traverseRoutes(
    siteId: string,
    nodeId: string,
    input: { readonly direction?: string; readonly depth?: number; readonly limit?: number },
  ): Promise<{
    readonly originNodeId: string;
    readonly direction: 'upstream' | 'downstream' | 'both';
    readonly depth: number;
    readonly nodes: readonly PlantNodeSummary[];
    readonly relationships: readonly PlantRelationshipDetail[];
    readonly truncated: boolean;
  }> {
    const site = await this.getSite(siteId);
    if (!site.draft.nodes.some((candidate) => candidate.id === nodeId)) {
      throw PlantModelError.notFound('The plant model node was not found.');
    }
    const direction =
      input.direction === 'upstream' || input.direction === 'downstream' ? input.direction : 'both';
    const depth = boundedInteger(input.depth, 1, 5, 1);
    const limit = boundedInteger(input.limit, 1, 100, 50);
    const routes = site.draft.relationships.filter(({ kind }) => kind === 'routes-to');
    const visited = new Set([nodeId]);
    const included = new Map<string, PlantRelationship>();
    let frontier = [nodeId];
    let truncated = false;
    for (let level = 0; level < depth && frontier.length > 0; level += 1) {
      const next: string[] = [];
      for (const current of frontier) {
        const adjacent = routes.filter((relationship) => {
          if (direction === 'upstream') return relationship.targetNodeId === current;
          if (direction === 'downstream') return relationship.sourceNodeId === current;
          return relationship.sourceNodeId === current || relationship.targetNodeId === current;
        });
        for (const relationship of adjacent) {
          const neighbor =
            relationship.sourceNodeId === current
              ? relationship.targetNodeId
              : relationship.sourceNodeId;
          if (!visited.has(neighbor) && visited.size >= limit + 1) {
            truncated = true;
            continue;
          }
          included.set(relationship.id, relationship);
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            next.push(neighbor);
          }
        }
      }
      frontier = next;
    }
    const nodes = new Map(site.draft.nodes.map((value) => [value.id, value]));
    const nodeTypes = new Map(site.draft.nodeTypes.map((value) => [value.id, value]));
    return {
      originNodeId: nodeId,
      direction,
      depth,
      nodes: [...visited]
        .filter((id) => id !== nodeId)
        .map((id) => nodes.get(id))
        .filter((node): node is PlantNode => node !== undefined)
        .map((node) => nodeSummary(node, nodeTypes, site.draft.relationships)),
      relationships: [...included.values()].map((relationship) =>
        relationshipDetail(relationship, nodes),
      ),
      truncated,
    };
  }

  public async save(
    id: string,
    draft: PlantModelDraft,
    expectedRevision: number,
  ): Promise<PlantSite> {
    validatePlantDraft(draft);
    const current = await this.getSite(id);
    if (current.revision !== expectedRevision) throw PlantModelError.versionConflict();
    assertSchemaEvolution(current.draft, draft);
    if (current.latestPublishedVersion !== undefined) {
      const published = await this.repository.findVersion(id, current.latestPublishedVersion);
      if (published !== undefined) {
        assertSchemaEvolution(published.draft, draft);
        assertPublishedOptionsPreserved(published.draft, draft);
      }
    }
    const result = await this.repository.save(
      id,
      draft,
      expectedRevision,
      this.clock.now().toISOString(),
    );
    if (result === 'VERSION_CONFLICT') throw PlantModelError.versionConflict();
    return this.getSite(id);
  }

  public listTemplates(): readonly PlantModelTemplate[] {
    return PLANT_MODEL_TEMPLATES;
  }

  public async applyTemplate(
    id: string,
    templateId: string,
    expectedRevision: number,
  ): Promise<PlantSite> {
    const template = PLANT_MODEL_TEMPLATES.find((candidate) => candidate.id === templateId);
    if (template === undefined)
      throw PlantModelError.validation('The plant template was not found.');
    return this.save(id, structuredClone(template.draft), expectedRevision);
  }

  public async publish(id: string, expectedRevision: number, note?: string): Promise<PlantSite> {
    const site = await this.getSite(id);
    if (site.revision !== expectedRevision) throw PlantModelError.versionConflict();
    if (site.publishedRevision === expectedRevision) throw PlantModelError.alreadyPublished();
    validatePlantDraft(site.draft, true);
    if (site.draft.nodes.length === 0)
      throw PlantModelError.validation('A published plant needs at least one node.');
    await this.assertRequiredCatalogValues(site.draft);
    const publishedAt = this.clock.now().toISOString();
    const number = (site.latestPublishedVersion ?? 0) + 1;
    const actor = this.contexts.require();
    const result = await this.unitOfWork.commit(() =>
      this.repository.publish(
        id,
        {
          id: this.ids.next(),
          number,
          revision: expectedRevision,
          draft: site.draft,
          publishedBy: actor.email ?? actor.subject,
          publishedAt,
          ...(cleanOptional(note, 400) === undefined ? {} : { note: cleanOptional(note, 400) }),
        },
        expectedRevision,
      ),
    );
    if (result === 'VERSION_CONFLICT') throw PlantModelError.versionConflict();
    if (result === 'ALREADY_PUBLISHED') throw PlantModelError.alreadyPublished();
    return this.getSite(id);
  }

  private async assertRequiredCatalogValues(draft: PlantModelDraft): Promise<void> {
    const types = new Map(draft.nodeTypes.map((value) => [value.id, value]));
    for (const node of draft.nodes) {
      const definitions = [
        ...(types.get(node.nodeTypeId)?.properties ?? []),
        ...node.localProperties,
      ];
      for (const definition of definitions) {
        if (!definition.required || definition.type !== 'catalog-scalar') continue;
        const binding = definition.catalogBinding;
        if (binding === undefined) {
          throw PlantModelError.validation(
            `${node.name} has an invalid required catalog property.`,
          );
        }
        const resolved = await this.catalogLookups.resolve(binding, node.values);
        if (resolved.kind !== 'scalar' || !resolved.available) {
          throw PlantModelError.validation(
            `${node.name} cannot resolve required property ${definition.name}.`,
          );
        }
      }
    }
  }

  public async listVersions(siteId: string): Promise<readonly PlantModelVersion[]> {
    await this.getSite(siteId);
    return (await this.repository.listVersions(siteId)).map(
      ({ draft: _draft, id: _id, ...version }) => version,
    );
  }

  public async diffVersions(siteId: string, from: number, to: number): Promise<PlantVersionDiff> {
    if (from === to) throw PlantModelError.validation('Choose two different versions.');
    const [left, right] = await Promise.all([
      this.repository.findVersion(siteId, from),
      this.repository.findVersion(siteId, to),
    ]);
    if (left === undefined || right === undefined) throw PlantModelError.notFound();
    return { from, to, changes: diffDraft(left.draft, right.draft) };
  }

  public async referenceData(siteId: string): Promise<PlantReferenceData> {
    const data = await this.repository.referenceData(siteId);
    if (data === undefined) throw PlantModelError.notFound();
    return data;
  }

  public async listDashboards(siteId: string): Promise<readonly PlantDashboardAssociation[]> {
    await this.getSite(siteId);
    return this.repository.listDashboards(siteId);
  }

  public async associateDashboard(
    siteId: string,
    dashboardId: string,
    input: {
      readonly role: PlantDashboardRole;
      readonly displayOrder: number;
      readonly isDefault: boolean;
    },
  ): Promise<readonly PlantDashboardAssociation[]> {
    await this.getSite(siteId);
    const result = await this.unitOfWork.commit(() =>
      this.repository.associateDashboard({
        siteId,
        dashboardId,
        ...input,
        now: this.clock.now().toISOString(),
      }),
    );
    if (result === 'DASHBOARD_NOT_FOUND') {
      throw PlantModelError.notFound('The dashboard was not found.');
    }
    return this.repository.listDashboards(siteId);
  }

  public async removeDashboard(siteId: string, dashboardId: string): Promise<void> {
    await this.getSite(siteId);
    await this.repository.removeDashboard(siteId, dashboardId);
  }
}

interface PlantNodeSummary {
  readonly id: string;
  readonly name: string;
  readonly nodeType: { readonly id: string; readonly name: string } | null;
  readonly routingRole: PlantNode['routingRole'];
  readonly parentNodeId: string | null;
  readonly childCount: number;
  readonly incomingRouteCount: number;
  readonly outgoingRouteCount: number;
}

interface PlantRelationshipDetail extends PlantRelationship {
  readonly sourceNodeName: string | null;
  readonly targetNodeName: string | null;
}

interface PlantNodeDetail extends PlantNodeSummary {
  readonly properties: readonly Readonly<Record<string, unknown>>[];
  readonly relationships: readonly PlantRelationshipDetail[];
}

function nodeSummary(
  node: PlantNode,
  nodeTypes: ReadonlyMap<string, PlantNodeType>,
  relationships: readonly PlantRelationship[],
): PlantNodeSummary {
  const type = nodeTypes.get(node.nodeTypeId);
  return {
    id: node.id,
    name: node.name,
    nodeType: type === undefined ? null : { id: type.id, name: type.name },
    routingRole: node.routingRole,
    parentNodeId:
      relationships.find(
        ({ kind, targetNodeId }) => kind === 'contains' && targetNodeId === node.id,
      )?.sourceNodeId ?? null,
    childCount: relationships.filter(
      ({ kind, sourceNodeId }) => kind === 'contains' && sourceNodeId === node.id,
    ).length,
    incomingRouteCount: relationships.filter(
      ({ kind, targetNodeId }) => kind === 'routes-to' && targetNodeId === node.id,
    ).length,
    outgoingRouteCount: relationships.filter(
      ({ kind, sourceNodeId }) => kind === 'routes-to' && sourceNodeId === node.id,
    ).length,
  };
}

function relationshipDetail(
  relationship: PlantRelationship,
  nodes: ReadonlyMap<string, PlantNode>,
): PlantRelationshipDetail {
  return {
    ...relationship,
    sourceNodeName: nodes.get(relationship.sourceNodeId)?.name ?? null,
    targetNodeName: nodes.get(relationship.targetNodeId)?.name ?? null,
  };
}

function boundedInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (value === undefined || !Number.isInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function summary(site: PlantSite): PlantSiteSummary {
  return {
    id: site.id,
    name: site.name,
    code: site.code,
    timezone: site.timezone,
    revision: site.revision,
    ...(site.latestPublishedVersion === undefined
      ? {}
      : { latestPublishedVersion: site.latestPublishedVersion }),
    ...(site.publishedRevision === undefined ? {} : { publishedRevision: site.publishedRevision }),
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    nodeCount: site.draft.nodes.length,
    routeCount: site.draft.relationships.filter((value) => value.kind === 'routes-to').length,
  };
}

function diffDraft(left: PlantModelDraft, right: PlantModelDraft): readonly PlantVersionChange[] {
  return [
    ...diffCollection('node-type', left.nodeTypes, right.nodeTypes),
    ...diffCollection('node', left.nodes, right.nodes),
    ...diffCollection('relationship', left.relationships, right.relationships),
  ];
}

function diffCollection(
  kind: PlantVersionChange['kind'],
  left: readonly { readonly id: string; readonly name?: string }[],
  right: readonly { readonly id: string; readonly name?: string }[],
): readonly PlantVersionChange[] {
  const before = new Map(left.map((value) => [value.id, value]));
  const after = new Map(right.map((value) => [value.id, value]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes: PlantVersionChange[] = [];
  for (const id of ids) {
    const oldValue = before.get(id);
    const newValue = after.get(id);
    if (oldValue === undefined && newValue !== undefined) {
      changes.push({ kind, action: 'added', id, name: newValue.name ?? id });
    } else if (oldValue !== undefined && newValue === undefined) {
      changes.push({ kind, action: 'removed', id, name: oldValue.name ?? id });
    } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ kind, action: 'changed', id, name: newValue?.name ?? id });
    }
  }
  return changes;
}

function cleanCode(value: string): string {
  const code = value.trim();
  if (!/^[A-Za-z0-9_]+$/u.test(code) || code.length > 120)
    throw PlantModelError.validation('Plant code must use letters, numbers, and underscores.');
  return code;
}
function cleanText(value: string, label: string, max: number): string {
  const cleaned = value.trim();
  if (cleaned.length === 0 || cleaned.length > max)
    throw PlantModelError.validation(`${label} is invalid.`);
  return cleaned;
}
function cleanOptional(value: string | undefined, max: number): string | undefined {
  const cleaned = value?.trim();
  if (cleaned !== undefined && cleaned.length > max)
    throw PlantModelError.validation(`Text may contain at most ${String(max)} characters.`);
  return cleaned === '' ? undefined : cleaned;
}

function assertSchemaEvolution(before: PlantModelDraft, after: PlantModelDraft): void {
  const afterDefinitions = definitionMap(after);
  for (const [definitionId, definition] of definitionMap(before)) {
    const replacement = afterDefinitions.get(definitionId);
    if (replacement === undefined || replacement.type === definition.type) continue;
    const hasValues = before.nodes.some((node) => Object.hasOwn(node.values, definitionId));
    if (hasValues) {
      throw PlantModelError.validation(
        `${definition.name} already has values; create a new property instead of changing its type.`,
      );
    }
  }
}

function assertPublishedOptionsPreserved(published: PlantModelDraft, draft: PlantModelDraft): void {
  const current = definitionMap(draft);
  for (const [definitionId, definition] of definitionMap(published)) {
    const optionIds = new Set(
      (current.get(definitionId)?.options ?? []).map((option) => option.id),
    );
    for (const option of definition.options ?? []) {
      const used = published.nodes.some((node) => {
        const value = node.values[definitionId];
        return value === option.id || (Array.isArray(value) && value.includes(option.id));
      });
      if (used && !optionIds.has(option.id)) {
        throw PlantModelError.validation(
          `${definition.name} contains a published option that must be deprecated instead of removed.`,
        );
      }
    }
  }
}

function definitionMap(draft: PlantModelDraft): ReadonlyMap<string, PlantPropertyDefinition> {
  const definitions = [
    ...draft.nodeTypes.flatMap((type) => type.properties),
    ...draft.nodes.flatMap((node) => node.localProperties),
  ];
  return new Map(definitions.map((definition) => [definition.id, definition]));
}
