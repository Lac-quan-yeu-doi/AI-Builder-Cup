import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import {
  MINDER_PRINCIPAL_ASSERTION_ISSUER,
  type MinderPrincipalAssertionIssuer,
} from '@application/administration/minder-principal-assertion';
import { createMinderAgentRequestHeaders } from '@infrastructure/http/automation/minder-agent-request-auth';
import {
  AgentWebhookTriggerRequest,
  AgentWebhookTriggerResult,
  AvailableAgent,
  IAgentWebhookClient,
} from '@application/automation/interfaces/i-agent-webhook-client';

const CALLER_ID = 'celesnity-core/automation-dispatcher';

@Injectable()
export class AgentWebhookClient implements IAgentWebhookClient {
  private readonly baseUrl: string;

  public constructor(
    config: ConfigService,
    @Optional() private readonly contexts?: AuthenticatedContextStore,
    @Optional()
    @Inject(MINDER_PRINCIPAL_ASSERTION_ISSUER)
    private readonly assertionIssuer?: MinderPrincipalAssertionIssuer,
  ) {
    this.baseUrl = config.getOrThrow('MINDER_AGENT_URL');
  }

  public async trigger(request: AgentWebhookTriggerRequest): Promise<AgentWebhookTriggerResult> {
    const callerId = this.callerId();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/webhooks/${request.source}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Delivery-Id': request.deliveryId,
          ...createMinderAgentRequestHeaders(this.contexts, this.assertionIssuer, callerId),
        },
        body: JSON.stringify({
          session_key: request.sessionKey,
          input: request.input,
          agent: request.agentId,
          ...(request.runId === undefined ? {} : { run_id: request.runId }),
          ...(request.automationContext === undefined
            ? {}
            : {
                automation_context: {
                  kind: 'automation-workflow',
                  workflow_id: request.automationContext.workflowId,
                  workflow_run_id: request.automationContext.workflowRunId,
                  workflow_step_id: request.automationContext.workflowStepId,
                  organization_id: request.automationContext.organizationId,
                },
              }),
          ...(request.systemPrompt !== undefined ? { system_prompt: request.systemPrompt } : {}),
        }),
      });
    } catch (error) {
      return {
        outcome: 'UNREACHABLE',
        message: error instanceof Error ? error.message : 'fetch failed',
      };
    }

    if (response.ok) {
      // Only a fresh admission carries a run_id (StartedBody) — a
      // duplicate-delivery response is `{"status": "duplicate_delivery"}`,
      // no run_id at all. Either way this is a real trigger; a body we
      // can't parse just means no run to link back to, not a failure.
      const body = (await response.json().catch(() => null)) as { run_id?: string } | null;
      if (request.runId !== undefined && body?.run_id !== request.runId)
        return {
          outcome: 'UNREACHABLE',
          message: 'Agent admission did not preserve the registered workflow run ID',
        };
      return body?.run_id !== undefined
        ? { outcome: 'TRIGGERED', runId: body.run_id, callerId }
        : { outcome: 'TRIGGERED', callerId };
    }
    if (response.status === 404) {
      return {
        outcome: 'UNKNOWN_AGENT',
        message: `minder-agent returned 404 for source "${request.source}"`,
      };
    }
    return {
      outcome: 'UNREACHABLE',
      message: `minder-agent returned ${response.status} ${response.statusText}`,
    };
  }

  public async listAgents(): Promise<readonly AvailableAgent[]> {
    // YAML manifests are the runtime's canonical tenant-scoped agent
    // registry. The legacy /agents route is the separate editable database
    // roster and is not populated by the TypeScript manifest composition.
    const response = await fetch(`${this.baseUrl}/agent-manifests`, {
      headers: createMinderAgentRequestHeaders(
        this.contexts,
        this.assertionIssuer,
        this.callerId(),
      ),
    });
    if (!response.ok) {
      throw new Error(
        `minder-agent returned ${response.status} ${response.statusText} listing agents`,
      );
    }
    const rows = (await response.json()) as {
      name: string;
      system_prompt?: string;
    }[];
    return rows.map((row) => ({
      name: row.name,
      ...(row.system_prompt !== undefined ? { systemPrompt: row.system_prompt } : {}),
    }));
  }

  private callerId(): string {
    return this.contexts?.current()?.subject ?? CALLER_ID;
  }
}
