import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import {
  MINDER_PRINCIPAL_ASSERTION_ISSUER,
  type MinderPrincipalAssertionIssuer,
} from '@application/administration/minder-principal-assertion';
import { createMinderAgentRequestHeaders } from '@infrastructure/http/automation/minder-agent-request-auth';

import type { AgentTranscriptClient } from '@infrastructure/worker/automation-workflow/automation-workflow-step-poller';

const CALLER_ID = 'celesnity-core/automation-workflow-poller';

interface TranscriptEntry {
  readonly role: string;
  readonly content: string;
}

@Injectable()
export class AgentTranscriptHttpClient implements AgentTranscriptClient {
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

  public async fetchTranscript(
    sessionId: string,
    callerId: string = CALLER_ID,
  ): Promise<{ finalAssistantMessage?: string } | undefined> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/sessions/${sessionId}/transcript`, {
        headers: createMinderAgentRequestHeaders(this.contexts, this.assertionIssuer, callerId),
      });
    } catch {
      return undefined;
    }
    if (!response.ok) return undefined;
    const body = (await response.json().catch(() => null)) as {
      history?: TranscriptEntry[];
    } | null;
    if (body?.history === undefined) return undefined;
    const lastAssistantEntry = [...body.history]
      .reverse()
      .find((entry) => entry.role === 'assistant');
    return { finalAssistantMessage: lastAssistantEntry?.content };
  }
}
