import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import {
  MINDER_PRINCIPAL_ASSERTION_ISSUER,
  type MinderPrincipalAssertionIssuer,
} from '@application/administration/minder-principal-assertion';
import { createMinderAgentRequestHeaders } from '@infrastructure/http/automation/minder-agent-request-auth';

import type {
  AgentRunStatus,
  IAgentRunStatusClient,
} from '@application/automation-workflow/interfaces/i-agent-run-status-client';

const CALLER_ID = 'celesnity-core/automation-workflow-poller';

@Injectable()
export class AgentRunStatusClient implements IAgentRunStatusClient {
  private readonly logger = new Logger(AgentRunStatusClient.name);
  private readonly baseUrl: string;
  private readonly warnedRuns = new Set<string>();

  public constructor(
    config: ConfigService,
    @Optional() private readonly contexts?: AuthenticatedContextStore,
    @Optional()
    @Inject(MINDER_PRINCIPAL_ASSERTION_ISSUER)
    private readonly assertionIssuer?: MinderPrincipalAssertionIssuer,
  ) {
    this.baseUrl = config.getOrThrow('MINDER_AGENT_URL');
  }

  public async fetchStatus(
    runId: string,
    callerId: string = CALLER_ID,
  ): Promise<AgentRunStatus | undefined> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/runs/${runId}/status`, {
        headers: createMinderAgentRequestHeaders(this.contexts, this.assertionIssuer, callerId),
      });
    } catch (error) {
      this.warnOnce(runId, {
        event: 'agent_run_status_request_failed',
        runId,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
      return undefined;
    }
    if (!response.ok) {
      this.warnOnce(runId, {
        event: 'agent_run_status_http_error',
        runId,
        status: response.status,
        statusText: response.statusText,
      });
      return undefined;
    }
    this.warnedRuns.delete(runId);
    const body = (await response.json().catch(() => null)) as {
      status?: string;
      session_id?: string;
      response_text?: string;
      error?: string;
    } | null;
    if (body?.status === undefined) {
      this.warnOnce(runId, { event: 'agent_run_status_invalid_response', runId });
      return undefined;
    }
    return {
      status: body.status,
      sessionId: body.session_id,
      responseText: body.response_text,
      error: body.error ?? undefined,
    };
  }

  private warnOnce(runId: string, detail: Readonly<Record<string, unknown>>): void {
    if (this.warnedRuns.has(runId)) return;
    this.warnedRuns.add(runId);
    this.logger.warn(JSON.stringify(detail));
  }
}
