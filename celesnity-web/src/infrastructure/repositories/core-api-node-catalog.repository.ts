import type {
  ListNodeDefinitionsQuery,
  NodeCatalogRepository,
} from '@/src/application/repositories/node-catalog.repository.interface';
import {
  NODE_PROPERTY_COMPONENTS,
  type NodeCategory,
  type NodeCategoryDefinition,
  type NodeDefinition,
  type NodeDefinitionSummary,
  type NodePort,
  type NodePropertyComponent,
  type NodePropertyField,
  type NodePropertyPanel,
  type NodePropertySection,
  type NodeSourceBinding,
  type NodeTargetBinding,
} from '@/src/entities/models/node-definition';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

type NodeCategoryCollectionResponseDto = components['schemas']['NodeCategoryCollectionResponseDto'];
type NodeDefinitionCollectionResponseDto =
  components['schemas']['NodeDefinitionCollectionResponseDto'];
type SingleNodeDefinitionResponseDto = components['schemas']['SingleNodeDefinitionResponseDto'];
type NodeDefinitionSummaryResponseDto = components['schemas']['NodeDefinitionSummaryResponseDto'];
type NodeDefinitionResponseDto = components['schemas']['NodeDefinitionResponseDto'];
type NodePortResponseDto = components['schemas']['NodePortResponseDto'];
type NodeSourceBindingResponseDto = components['schemas']['NodeSourceBindingResponseDto'];
type NodeTargetBindingResponseDto = components['schemas']['NodeTargetBindingResponseDto'];
type NodePropertyPanelResponseDto = components['schemas']['NodePropertyPanelResponseDto'];
type NodePropertySectionResponseDto = components['schemas']['NodePropertySectionResponseDto'];
type NodePropertyFieldResponseDto = components['schemas']['NodePropertyFieldResponseDto'];

const DEFAULT_PAGE_SIZE = 20;

export class CoreApiNodeCatalogRepository implements NodeCatalogRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listCategories(): Promise<readonly NodeCategoryDefinition[]> {
    const response = await this.request<NodeCategoryCollectionResponseDto>('/node-categories');
    return response.data.map((dto) => ({
      type: dto.type,
      label: dto.label,
      order: dto.order,
    }));
  }

  public async listDefinitions(
    query: ListNodeDefinitionsQuery,
  ): Promise<readonly NodeDefinitionSummary[]> {
    const search = new URLSearchParams({
      page: '1',
      pageSize: String(query.pageSize ?? DEFAULT_PAGE_SIZE),
    });
    if (query.category) {
      search.set('category', query.category);
    }
    const keyword = query.keyword?.trim();
    if (keyword) {
      search.set('keyword', keyword);
    }

    const response = await this.request<NodeDefinitionCollectionResponseDto>(
      `/node-definitions?${search.toString()}`,
    );
    return response.data.map(mapSummary);
  }

  public async getDefinition(nodeType: string): Promise<NodeDefinition> {
    const response = await this.request<SingleNodeDefinitionResponseDto>(
      `/node-definitions/${encodeURIComponent(nodeType)}`,
    );
    return mapDefinition(response.data);
  }

  private async request<TResponse>(path: string): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, { method: 'GET' });
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapSummary(dto: NodeDefinitionSummaryResponseDto): NodeDefinitionSummary {
  return {
    resourceId: dto.resourceId,
    type: dto.type,
    category: dto.category satisfies NodeCategory,
    label: dto.label,
    description: dto.description,
    iconKey: dto.iconKey,
    enabled: dto.enabled,
    runtimeKind: dto.runtimeKind,
    inputPorts: dto.inputPorts.map(mapPort),
    outputPorts: dto.outputPorts.map(mapPort),
    ...(dto.source ? { source: mapSourceBinding(dto.source) } : {}),
    ...(dto.target ? { target: mapTargetBinding(dto.target) } : {}),
  };
}

function mapDefinition(dto: NodeDefinitionResponseDto): NodeDefinition {
  return { ...mapSummary(dto), propertyPanel: mapPanel(dto.propertyPanel) };
}

function mapPort(dto: NodePortResponseDto): NodePort {
  return {
    id: dto.id,
    label: dto.label,
    dataType: dto.dataType,
    required: dto.required,
    // `null` is the contract's way of saying the port is unbounded.
    ...(typeof dto.maxConnections === 'number' ? { maxConnections: dto.maxConnections } : {}),
  };
}

function mapSourceBinding(dto: NodeSourceBindingResponseDto): NodeSourceBinding {
  return {
    connectionId: dto.connectionId,
    connectionName: dto.connectionName,
    dbmsType: dto.dbmsType,
    verificationStatus: dto.verificationStatus,
    ...(dto.lastTestedAt ? { lastTestedAt: dto.lastTestedAt } : {}),
    ...(dto.lastTestError ? { lastTestError: dto.lastTestError } : {}),
  };
}

function mapTargetBinding(dto: NodeTargetBindingResponseDto): NodeTargetBinding {
  return {
    catalogName: dto.catalogName,
    databaseName: dto.databaseName,
    tableName: dto.tableName,
    tableType: dto.tableType,
    storageFormat: dto.storageFormat,
  };
}

function mapPanel(dto: NodePropertyPanelResponseDto): NodePropertyPanel {
  return { sections: dto.sections.map(mapSection) };
}

function mapSection(dto: NodePropertySectionResponseDto): NodePropertySection {
  return { id: dto.id, title: dto.title, fields: dto.fields.map(mapField) };
}

/**
 * `defaultValue` is typed as an empty record by the generator even though the
 * API sends whatever the field expects, so it is carried as an opaque value.
 */
function mapField(dto: NodePropertyFieldResponseDto): NodePropertyField {
  if (!isPropertyComponent(dto.component)) {
    throw new Error(`The Core API returned an unsupported property component: ${dto.component}`);
  }

  return {
    key: dto.key,
    label: dto.label,
    component: dto.component,
    required: dto.required,
    ...(dto.description ? { description: dto.description } : {}),
    ...(dto.defaultValue === undefined ? {} : { defaultValue: dto.defaultValue as unknown }),
    ...(dto.dependsOn ? { dependsOn: dto.dependsOn } : {}),
    ...(dto.visibleWhen
      ? {
          visibleWhen: {
            field: dto.visibleWhen.field,
            equals: dto.visibleWhen.equals,
          },
        }
      : {}),
    ...(dto.options ? { options: dto.options.map((option) => ({ ...option })) } : {}),
  };
}

function isPropertyComponent(value: string): value is NodePropertyComponent {
  return NODE_PROPERTY_COMPONENTS.some((component) => component === value);
}
