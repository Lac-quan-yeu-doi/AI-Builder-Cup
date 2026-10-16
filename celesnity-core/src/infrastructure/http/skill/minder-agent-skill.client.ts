import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import {
  MINDER_PRINCIPAL_ASSERTION_ISSUER,
  type MinderPrincipalAssertionIssuer,
} from '@application/administration/minder-principal-assertion';
import { createMinderAgentRequestHeaders } from '@infrastructure/http/automation/minder-agent-request-auth';
import {
  SkillClientError,
  type CreateSkillInput,
  type ISkillClient,
  type SkillDetail,
  type SkillSummary,
  type UpdateSkillInput,
} from '@application/skill/interfaces/i-skill-client';

interface AgentErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string };
}

/**
 * Thin HTTP proxy to minder-agent's project-local skill files (see
 * `crates/presentation/minder-serve/src/skills/mod.rs`). Unlike the
 * chart/document/automation MCP tools, skills are NOT modelled as
 * celesnity-core `ActionDefinition`s — there is no separate celesnity-core
 * skill entity or repository here, only a tenant-scoped pass-through to the
 * runtime that owns the skill files on disk. Runtime governance still controls
 * the MCP call before this client runs. celesnity-core is the MCP front door
 * so the skill-creator agent reaches the same `/skills` API the web UI already
 * uses (see celesnity-web's `AgentApiSkillRepository`). Reads
 * `MINDER_AGENT_URL` the same way `AgentWorkspaceTreeClient` does.
 */
@Injectable()
export class MinderAgentSkillClient implements ISkillClient {
  private readonly logger = new Logger(MinderAgentSkillClient.name);
  private readonly baseUrl: string;
  private readonly contexts: AuthenticatedContextStore;

  public constructor(
    config: ConfigService,
    contexts: AuthenticatedContextStore,
    @Optional()
    @Inject(MINDER_PRINCIPAL_ASSERTION_ISSUER)
    private readonly assertionIssuer?: MinderPrincipalAssertionIssuer,
  ) {
    this.baseUrl = config.getOrThrow<string>('MINDER_AGENT_URL');
    this.contexts = contexts;
  }

  public async list(): Promise<readonly SkillSummary[]> {
    const skills = await this.request<SkillSummary[]>('GET', '/skills');
    return skills ?? [];
  }

  public async get(name: string): Promise<SkillDetail | undefined> {
    try {
      const detail = await this.request<SkillDetail>('GET', this.skillPath(name));
      return detail ?? undefined;
    } catch (error) {
      if (error instanceof SkillClientError && error.status === 404) return undefined;
      throw error;
    }
  }

  public async create(input: CreateSkillInput): Promise<SkillDetail> {
    const created = await this.request<SkillDetail>('POST', '/skills', input);
    if (created === undefined) {
      throw new SkillClientError(502, 'skill_create_empty', 'minder-agent returned no skill body');
    }
    return created;
  }

  public async update(input: UpdateSkillInput): Promise<SkillDetail> {
    const { name, description, namespace, body } = input;
    const updated = await this.request<SkillDetail>('PUT', this.skillPath(name), {
      description,
      namespace,
      body,
    });
    if (updated === undefined) {
      throw new SkillClientError(502, 'skill_update_empty', 'minder-agent returned no skill body');
    }
    return updated;
  }

  public async delete(name: string): Promise<void> {
    await this.request<void>('DELETE', this.skillPath(name));
  }

  private skillPath(name: string): string {
    return `/skills/${encodeURIComponent(name)}`;
  }

  private async request<TResponse>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<TResponse | undefined> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          // Skill MCP calls are wrapped by AgentRoomDelegationService. Use its
          // verified subject so the agent store applies the same tenant scope
          // as the web Skills page, never a shared proxy owner.
          ...createMinderAgentRequestHeaders(
            this.contexts,
            this.assertionIssuer,
            this.contexts.require().subject,
          ),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`skill ${method} ${path} to minder-agent failed: ${message}`);
      throw new SkillClientError(
        502,
        'skill_agent_unreachable',
        `minder-agent unreachable: ${message}`,
      );
    }

    if (!response.ok) {
      const parsed = (await response.json().catch(() => null)) as AgentErrorBody | null;
      const code = parsed?.error?.code ?? 'skill_request_failed';
      const message =
        parsed?.error?.message ?? `minder-agent returned ${response.status} for ${method} ${path}`;
      throw new SkillClientError(response.status, code, message);
    }

    if (response.status === 204) return undefined;
    const parsed = (await response.json().catch(() => null)) as TResponse | null;
    return parsed ?? undefined;
  }
}
