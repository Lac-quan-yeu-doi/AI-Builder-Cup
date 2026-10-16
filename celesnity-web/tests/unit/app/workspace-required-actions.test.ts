import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isWorkspaceRequiredActionId,
  observeAssignMetadataCrawlerRequiredAction,
  observeCreateDatabaseRequiredAction,
  observeCreateDatabaseSourceRequiredAction,
  observeRunMetadataCrawlerRequiredAction,
  observeRunQueryRequiredAction,
  observeTestDatabaseConnectionRequiredAction,
  subscribeToWorkspaceRequiredAction,
  workspaceRequiredActionIds,
  type WorkspaceRequiredActionId,
} from '@/app/_components/shared/workspace-required-actions';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { QueryEditorSession } from '@/src/entities/models/query';
import {
  createSubmitQueryController,
  type SubmitQueryController,
} from '@/src/interface-adapters/controllers/queries/submit-query.controller';
import type { SqlExecutionAcceptedViewModel } from '@/src/interface-adapters/presenters/query.presenter';

const subscriptions: Array<() => void> = [];

function subscribe(actionId: WorkspaceRequiredActionId, listener: () => void | Promise<void>) {
  const unsubscribe = subscribeToWorkspaceRequiredAction(actionId, listener);
  subscriptions.push(unsubscribe);
  return unsubscribe;
}

afterEach(() => {
  for (const unsubscribe of subscriptions.splice(0)) {
    unsubscribe();
  }
});

describe('Workspace Required Action controller equivalence', () => {
  it('uses the exact unguided controller input and preserves its successful outcome', async () => {
    const input: QueryEditorSession = {
      sql: 'SELECT * FROM telemetry',
      context: { catalog: 'iceberg', namespace: 'factory' },
    };
    const outcome: SqlExecutionAcceptedViewModel = { id: 'query-42', status: 'queued' };
    const unguidedController = vi.fn<SubmitQueryController>().mockResolvedValue(outcome);
    const guidedObservedController: SubmitQueryController =
      observeRunQueryRequiredAction(unguidedController);
    const observed = vi.fn();
    subscribe(workspaceRequiredActionIds.runQuery, observed);

    const result = await guidedObservedController(input);

    expect(unguidedController).toHaveBeenCalledOnce();
    expect(unguidedController).toHaveBeenCalledWith(input);
    expect(unguidedController.mock.calls[0]?.[0]).toBe(input);
    expect(result).toBe(outcome);
    expect(observed).toHaveBeenCalledOnce();
    expect(observed).toHaveBeenCalledWith();
  });

  it('preserves the exact controller validation and authorization failure paths', async () => {
    const authorizationFailure = new Error('Existing Workspace authorization denied the operation');
    const submitUseCase = vi
      .fn()
      .mockRejectedValueOnce(authorizationFailure)
      .mockResolvedValue({ id: 'query-ignored', status: 'queued' as const });
    const unguidedController = createSubmitQueryController(submitUseCase);
    const guidedObservedController = observeRunQueryRequiredAction(unguidedController);
    const observed = vi.fn();
    subscribe(workspaceRequiredActionIds.runQuery, observed);

    await expect(
      guidedObservedController({
        sql: 'SELECT restricted_value FROM protected_table',
        context: { catalog: 'iceberg' },
      }),
    ).rejects.toBe(authorizationFailure);

    const malformedInput = {
      sql: 42,
      context: { catalog: 'iceberg' },
    } as unknown as QueryEditorSession;
    await expect(guidedObservedController(malformedInput)).rejects.toBeInstanceOf(InputParseError);

    expect(submitUseCase).toHaveBeenCalledOnce();
    expect(observed).not.toHaveBeenCalled();
  });

  it('leaves confirmation with the unguided caller and cannot bypass a declined action', async () => {
    const outcome: SqlExecutionAcceptedViewModel = { id: 'query-43', status: 'queued' };
    const unguidedController = vi.fn<SubmitQueryController>().mockResolvedValue(outcome);
    const guidedObservedController = observeRunQueryRequiredAction(unguidedController);
    const observed = vi.fn();
    subscribe(workspaceRequiredActionIds.runQuery, observed);
    const input: QueryEditorSession = {
      sql: 'DELETE FROM telemetry',
      context: { catalog: 'iceberg' },
    };
    const invokeAfterExistingConfirmation = async (
      confirmed: boolean,
    ): Promise<SqlExecutionAcceptedViewModel | undefined> =>
      confirmed ? guidedObservedController(input) : undefined;

    await expect(invokeAfterExistingConfirmation(false)).resolves.toBeUndefined();
    expect(unguidedController).not.toHaveBeenCalled();
    expect(observed).not.toHaveBeenCalled();

    await expect(invokeAfterExistingConfirmation(true)).resolves.toBe(outcome);
    expect(unguidedController).toHaveBeenCalledOnce();
    expect(unguidedController.mock.calls[0]?.[0]).toBe(input);
    expect(observed).toHaveBeenCalledOnce();
  });

  it('keeps a successful Workspace outcome unchanged when a tutorial observer fails', async () => {
    const outcome: SqlExecutionAcceptedViewModel = { id: 'query-44', status: 'queued' };
    const unguidedController = vi.fn<SubmitQueryController>().mockResolvedValue(outcome);
    const guidedObservedController = observeRunQueryRequiredAction(unguidedController);
    subscribe(workspaceRequiredActionIds.runQuery, async () => {
      throw new Error('Tutorial observer failed');
    });

    await expect(
      guidedObservedController({ sql: 'SELECT 1', context: { catalog: 'iceberg' } }),
    ).resolves.toBe(outcome);
  });

  it('attributes an in-flight success only to the still-active subscriber at invocation time', async () => {
    const outcome: SqlExecutionAcceptedViewModel = { id: 'query-45', status: 'queued' };
    let resolveController: ((value: SqlExecutionAcceptedViewModel) => void) | undefined;
    const unguidedController = vi.fn<SubmitQueryController>().mockImplementation(
      () =>
        new Promise<SqlExecutionAcceptedViewModel>((resolve) => {
          resolveController = resolve;
        }),
    );
    const guidedObservedController = observeRunQueryRequiredAction(unguidedController);
    const originalStep = vi.fn();
    const laterStep = vi.fn();
    const unsubscribeOriginal = subscribe(workspaceRequiredActionIds.runQuery, originalStep);

    const operation = guidedObservedController({
      sql: 'SELECT delayed_result',
      context: { catalog: 'iceberg' },
    });
    unsubscribeOriginal();
    subscribe(workspaceRequiredActionIds.runQuery, laterStep);
    resolveController?.(outcome);

    await expect(operation).resolves.toBe(outcome);
    expect(originalStep).not.toHaveBeenCalled();
    expect(laterStep).not.toHaveBeenCalled();
  });

  it('narrows published descriptor IDs before the walkthrough host subscribes', () => {
    const supportedDescriptorId: string = 'run-query';
    const unsupportedDescriptorId: string = 'privileged-run-query';

    expect(isWorkspaceRequiredActionId(supportedDescriptorId)).toBe(true);
    expect(isWorkspaceRequiredActionId(unsupportedDescriptorId)).toBe(false);
    expect(isWorkspaceRequiredActionId('test-database-connection')).toBe(true);
    expect(isWorkspaceRequiredActionId('create-database')).toBe(true);
    expect(isWorkspaceRequiredActionId('create-database-source')).toBe(true);
    expect(isWorkspaceRequiredActionId('assign-metadata-crawler')).toBe(true);
    expect(isWorkspaceRequiredActionId('run-metadata-crawler')).toBe(true);

    if (isWorkspaceRequiredActionId(supportedDescriptorId)) {
      expect(() => subscribe(supportedDescriptorId, vi.fn())).not.toThrow();
    }
  });

  it('observes a successful database connection test without changing its contract', async () => {
    const outcome = { status: 'SUCCEEDED' as const };
    const testConnection = vi.fn().mockResolvedValue(outcome);
    const observedTest = observeTestDatabaseConnectionRequiredAction(testConnection);
    const observed = vi.fn();
    subscribe(workspaceRequiredActionIds.testDatabaseConnection, observed);

    await expect(observedTest('service-1')).resolves.toBe(outcome);
    expect(testConnection).toHaveBeenCalledWith('service-1');
    expect(observed).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'create database',
      workspaceRequiredActionIds.createDatabase,
      observeCreateDatabaseRequiredAction,
    ],
    [
      'create database source',
      workspaceRequiredActionIds.createDatabaseSource,
      observeCreateDatabaseSourceRequiredAction,
    ],
    [
      'assign metadata crawler',
      workspaceRequiredActionIds.assignMetadataCrawler,
      observeAssignMetadataCrawlerRequiredAction,
    ],
    [
      'run metadata crawler',
      workspaceRequiredActionIds.runMetadataCrawler,
      observeRunMetadataCrawlerRequiredAction,
    ],
  ] as const)(
    'observes %s only after the Workspace controller succeeds',
    async (_, actionId, observe) => {
      const outcome = { id: 'result-1' };
      const controller = vi.fn().mockResolvedValue(outcome);
      const observedController = observe(controller);
      const listener = vi.fn();
      subscribe(actionId, listener);

      await expect(observedController('input-1')).resolves.toBe(outcome);
      expect(controller).toHaveBeenCalledWith('input-1');
      expect(listener).toHaveBeenCalledOnce();
    },
  );
});
