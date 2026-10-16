import type { SubmitQueryController } from '@/src/interface-adapters/controllers/queries/submit-query.controller';

export const workspaceRequiredActionIds = Object.freeze({
  runQuery: 'run-query',
  testDatabaseConnection: 'test-database-connection',
  createDatabase: 'create-database',
  createDatabaseSource: 'create-database-source',
  assignMetadataCrawler: 'assign-metadata-crawler',
  runMetadataCrawler: 'run-metadata-crawler',
  tutorialSelectDatabase: 'tutorial-select-database',
  tutorialSendPrompt: 'tutorial-send-prompt',
  tutorialOpenReasoning: 'tutorial-open-reasoning',
  tutorialSendTablePrompt: 'tutorial-send-table-prompt',
  tutorialOpenTableArtifact: 'tutorial-open-table-artifact',
  tutorialSendChartPrompt: 'tutorial-send-chart-prompt',
  tutorialOpenChartArtifact: 'tutorial-open-chart-artifact',
  tutorialSendReportPrompt: 'tutorial-send-report-prompt',
  tutorialOpenReport: 'tutorial-open-report',
  tutorialSendApprovalPrompt: 'tutorial-send-approval-prompt',
  tutorialAnswerClarification: 'tutorial-answer-clarification',
  tutorialApproveAction: 'tutorial-approve-action',
  tutorialAttachFile: 'tutorial-attach-file',
  tutorialSendFilePrompt: 'tutorial-send-file-prompt',
  tutorialCreateThread: 'tutorial-create-thread',
  tutorialSendSecondThreadPrompt: 'tutorial-send-second-thread-prompt',
  tutorialOpenHistory: 'tutorial-open-history',
  tutorialSwitchThread: 'tutorial-switch-thread',
} as const);

export type WorkspaceRequiredActionId =
  (typeof workspaceRequiredActionIds)[keyof typeof workspaceRequiredActionIds];

export type WorkspaceRequiredActionListener = () => void | Promise<void>;

interface WorkspaceRequiredActionSubscription {
  readonly listener: WorkspaceRequiredActionListener;
  active: boolean;
}

const subscriptionsByActionId = new Map<
  WorkspaceRequiredActionId,
  Set<WorkspaceRequiredActionSubscription>
>();

/** Narrows a published Required Action descriptor to an operation this client can observe. */
export function isWorkspaceRequiredActionId(
  actionId: string,
): actionId is WorkspaceRequiredActionId {
  return Object.values<string>(workspaceRequiredActionIds).includes(actionId);
}

function captureActiveSubscriptions(
  actionId: WorkspaceRequiredActionId,
): readonly WorkspaceRequiredActionSubscription[] {
  return [...(subscriptionsByActionId.get(actionId) ?? [])];
}

function publishSubscriptionsSucceeded(
  subscriptions: readonly WorkspaceRequiredActionSubscription[],
): void {
  for (const subscription of subscriptions) {
    if (!subscription.active) {
      continue;
    }

    try {
      void Promise.resolve(subscription.listener()).catch(() => undefined);
    } catch {
      // Tutorial observation must never change a successful Workspace outcome.
    }
  }
}

function observeWorkspaceControllerOperation<TArguments extends readonly unknown[], TResult>(
  actionId: WorkspaceRequiredActionId,
  controller: (...args: TArguments) => Promise<TResult>,
): (...args: TArguments) => Promise<TResult> {
  return async (...args) => {
    // Attribute success only to the active step that observed the operation's
    // invocation. A later step subscribing to the same action cannot claim an
    // already in-flight Workspace operation.
    const subscriptions = captureActiveSubscriptions(actionId);
    const result = await controller(...args);
    publishSubscriptionsSucceeded(subscriptions);
    return result;
  };
}

/** Publishes a tutorial-owned, payload-free success signal after local simulation succeeds. */
export function publishWorkspaceRequiredActionSucceeded(actionId: WorkspaceRequiredActionId): void {
  publishSubscriptionsSucceeded(captureActiveSubscriptions(actionId));
}

/**
 * Decorates the exact controller used by the unguided Query Workspace.
 *
 * The wrapper forwards the original argument objects unchanged, returns or
 * throws the original controller outcome, and emits only a payload-free success
 * signal after the controller resolves. Authorization and validation therefore
 * remain in the existing controller/use-case path, while confirmation remains
 * owned by the same Workspace UI that decides whether to invoke the controller.
 */
export function observeRunQueryRequiredAction(
  controller: SubmitQueryController,
): SubmitQueryController {
  return observeWorkspaceControllerOperation(workspaceRequiredActionIds.runQuery, controller);
}

/** Observes either saved or unsaved database-source connectivity tests. */
export function observeTestDatabaseConnectionRequiredAction<
  TArguments extends readonly unknown[],
  TResult,
>(
  controller: (...args: TArguments) => Promise<TResult>,
): (...args: TArguments) => Promise<TResult> {
  return observeWorkspaceControllerOperation(
    workspaceRequiredActionIds.testDatabaseConnection,
    controller,
  );
}

export function observeCreateDatabaseRequiredAction<TArguments extends readonly unknown[], TResult>(
  controller: (...args: TArguments) => Promise<TResult>,
): (...args: TArguments) => Promise<TResult> {
  return observeWorkspaceControllerOperation(workspaceRequiredActionIds.createDatabase, controller);
}

export function observeCreateDatabaseSourceRequiredAction<
  TArguments extends readonly unknown[],
  TResult,
>(
  controller: (...args: TArguments) => Promise<TResult>,
): (...args: TArguments) => Promise<TResult> {
  return observeWorkspaceControllerOperation(
    workspaceRequiredActionIds.createDatabaseSource,
    controller,
  );
}

export function observeAssignMetadataCrawlerRequiredAction<
  TArguments extends readonly unknown[],
  TResult,
>(
  controller: (...args: TArguments) => Promise<TResult>,
): (...args: TArguments) => Promise<TResult> {
  return observeWorkspaceControllerOperation(
    workspaceRequiredActionIds.assignMetadataCrawler,
    controller,
  );
}

export function observeRunMetadataCrawlerRequiredAction<
  TArguments extends readonly unknown[],
  TResult,
>(
  controller: (...args: TArguments) => Promise<TResult>,
): (...args: TArguments) => Promise<TResult> {
  return observeWorkspaceControllerOperation(
    workspaceRequiredActionIds.runMetadataCrawler,
    controller,
  );
}

/**
 * Lets the walkthrough host observe a successful existing Workspace operation.
 * Dynamic descriptor IDs must first be narrowed with
 * `isWorkspaceRequiredActionId`; no operation input or result enters this
 * tutorial-only channel.
 */
export function subscribeToWorkspaceRequiredAction(
  actionId: WorkspaceRequiredActionId,
  listener: WorkspaceRequiredActionListener,
): () => void {
  const subscriptions =
    subscriptionsByActionId.get(actionId) ?? new Set<WorkspaceRequiredActionSubscription>();
  const subscription: WorkspaceRequiredActionSubscription = { listener, active: true };
  subscriptions.add(subscription);
  subscriptionsByActionId.set(actionId, subscriptions);

  return () => {
    if (!subscription.active) {
      return;
    }

    subscription.active = false;
    subscriptions.delete(subscription);
    if (subscriptions.size === 0) {
      subscriptionsByActionId.delete(actionId);
    }
  };
}
