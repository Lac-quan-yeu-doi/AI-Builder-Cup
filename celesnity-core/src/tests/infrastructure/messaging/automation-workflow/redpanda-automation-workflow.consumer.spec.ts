import { ConfigService } from '@nestjs/config';

import { RedpandaAutomationWorkflowConsumer } from '@infrastructure/messaging/automation-workflow/redpanda-automation-workflow.consumer';
import type { AutomationWorkflowUseCases } from '@application/automation-workflow/automation-workflow.use-cases';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { redpandaTlsConfiguration } from '@infrastructure/messaging/redpanda-tls';

jest.mock('@infrastructure/messaging/redpanda-tls', () => ({
  redpandaTlsConfiguration: jest.fn(() => false),
}));

const mockedRedpandaTlsConfiguration = jest.mocked(redpandaTlsConfiguration);

const EVENT_ID = '44444444-4444-4444-8444-444444444444';
const ORGANIZATION_ID = '55555555-5555-4555-8555-555555555555';

function config(): ConfigService {
  return new ConfigService({
    REDPANDA_BROKERS: 'localhost:19092',
    REDPANDA_USERNAME: 'celesnity-admin',
    REDPANDA_PASSWORD: 'celesnity_redpanda_password',
    REDPANDA_TLS_ENABLED: false,
    AGENT_AUTOMATION_TOPICS: 'celesnity.streaming.control.v1',
    AGENT_AUTOMATION_WORKFLOW_CONSUMER_GROUP_ID: 'celesnity.automation-workflow.v1',
    INTEGRATION_EVENT_PUBLISHER_BACKEND: 'redpanda',
  });
}

describe('RedpandaAutomationWorkflowConsumer.handleMessage', () => {
  beforeEach(() => {
    mockedRedpandaTlsConfiguration.mockClear();
  });

  function makeConsumer(dispatch: jest.Mock) {
    const useCases = {
      dispatchWorkflowsForEvent: dispatch,
    } as unknown as AutomationWorkflowUseCases;
    const contexts = {
      runBackground: jest.fn((_organizationId: string, work: () => Promise<unknown>) => work()),
    } as unknown as AuthenticatedContextStore;
    return new RedpandaAutomationWorkflowConsumer(useCases, contexts, config());
  }

  it('dispatches a well-formed envelope to the workflow use case', async () => {
    const dispatch = jest.fn(async () => undefined);
    const consumer = makeConsumer(dispatch);
    const value = JSON.stringify({
      eventId: EVENT_ID,
      organizationId: ORGANIZATION_ID,
      payload: { summary: 'done' },
    });

    const outcome = await consumer.handleMessage(
      'celesnity.streaming.control.v1',
      Buffer.from(value),
    );

    expect(outcome).toBe('DISPATCHED');
    expect(dispatch).toHaveBeenCalledWith(ORGANIZATION_ID, 'celesnity.streaming.control.v1', {
      summary: 'done',
    });
  });

  it('uses the shared CA-aware Redpanda TLS configuration', () => {
    makeConsumer(jest.fn());

    expect(mockedRedpandaTlsConfiguration).toHaveBeenCalledWith(expect.any(ConfigService));
  });

  it('ignores a malformed envelope without throwing', async () => {
    const dispatch = jest.fn();
    const consumer = makeConsumer(dispatch);
    const outcome = await consumer.handleMessage(
      'celesnity.streaming.control.v1',
      Buffer.from('not json'),
    );
    expect(outcome).toBe('IGNORED');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('ignores a null message value', async () => {
    const dispatch = jest.fn();
    const consumer = makeConsumer(dispatch);
    expect(await consumer.handleMessage('celesnity.streaming.control.v1', null)).toBe('IGNORED');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
