import type { ActionCatalogRepository } from '@/src/application/repositories/action-catalog.repository.interface';
import type {
  ActionCatalogDomain,
  ActionCatalogEntry,
  ActionPermission,
} from '@/src/entities/models/action-catalog';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface McpToolCatalogEntryDto {
  tool_name: string;
  action_name: string;
  description: string;
  input_schema: Record<string, unknown>;
  permission: string;
  audit_required: boolean;
  approval_required: boolean;
}

const DOMAIN_PATHS: Readonly<Record<ActionCatalogDomain, string>> = {
  chart: '/chart-actions/mcp-tools',
  document: '/document-actions/mcp-tools',
};

export class CoreApiActionCatalogRepository implements ActionCatalogRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(domain: ActionCatalogDomain): Promise<readonly ActionCatalogEntry[]> {
    const response = await this.request<McpToolCatalogEntryDto[]>(DOMAIN_PATHS[domain], {
      method: 'GET',
    });
    return response.map(mapEntry);
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapEntry(dto: McpToolCatalogEntryDto): ActionCatalogEntry {
  return {
    toolName: dto.tool_name,
    actionName: dto.action_name,
    description: dto.description,
    inputSchema: dto.input_schema,
    permission: isPermission(dto.permission) ? dto.permission : 'read',
    auditRequired: dto.audit_required,
    approvalRequired: dto.approval_required,
  };
}

function isPermission(value: string): value is ActionPermission {
  return value === 'read' || value === 'write';
}
