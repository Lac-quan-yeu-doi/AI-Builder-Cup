import type { ManageChatUseCase } from '@/src/application/use-cases/chat/manage-chat.use-case';
import type { SendMessageInput } from '@/src/entities/models/chat';
import { presentSendMessageResult } from '@/src/interface-adapters/presenters/chat.presenter';

export type ManageChatController = ReturnType<typeof createManageChatController>;

/**
 * Callable like every other multi-operation controller: the primary operation
 * is the function itself and the rest hang off it, which is what
 * `tests/unit/di/container.test.ts` asserts of every UI-facing controller.
 */
export const createManageChatController = (useCase: ManageChatUseCase) => {
  const sendMessage = async (input: SendMessageInput) =>
    presentSendMessageResult(await useCase.sendMessage(input));

  return Object.assign(sendMessage, {
    sendMessage,
    closeRunRegistration: useCase.closeRunRegistration,
    listSessions: (userId: string) => useCase.listSessions(userId),
    streamEvents: (userId: string, roomId: string, from?: string, signal?: AbortSignal) =>
      useCase.streamEvents(userId, roomId, from, signal),
    streamRunEvents: (userId: string, runId: string, from?: string, signal?: AbortSignal) =>
      useCase.streamRunEvents(userId, runId, from, signal),
    getSessionTranscript: (userId: string, roomId: string, agentName?: string) =>
      useCase.getSessionTranscript(userId, roomId, agentName),
    getSessionState: (userId: string, roomId: string, agentName?: string) =>
      useCase.getSessionState(userId, roomId, agentName),
    getRoomHistory: useCase.getRoomHistory
      ? (userId: string, roomId: string) => useCase.getRoomHistory!(userId, roomId)
      : undefined,
    resetConversation: (userId: string, roomId: string, agentName: string) =>
      useCase.resetConversation(userId, roomId, agentName),
    getSessionTranscriptById: (userId: string, sessionId: string) =>
      useCase.getSessionTranscriptById(userId, sessionId),
    checkHealth: () => useCase.checkHealth(),
    getRunManifest: (userId: string, runId: string) => useCase.getRunManifest(userId, runId),
    getRunTrace: (userId: string, runId: string) => useCase.getRunTrace(userId, runId),
    getRunReport: (userId: string, runId: string) => useCase.getRunReport(userId, runId),
    getRunValidation: (userId: string, runId: string) => useCase.getRunValidation(userId, runId),
    getRoomMetrics: (userId: string, roomId: string) => useCase.getRoomMetrics(userId, roomId),
    listRunFiles: (userId: string, runId: string) => useCase.listRunFiles(userId, runId),
    getRunFileContent: (userId: string, runId: string, path: string) =>
      useCase.getRunFileContent(userId, runId, path),
    listRunApprovals: (userId: string, runId: string) => useCase.listRunApprovals(userId, runId),
    decideRunApproval: (
      userId: string,
      runId: string,
      approvalId: string,
      decision: 'approved' | 'denied',
    ) => useCase.decideRunApproval(userId, runId, approvalId, decision),
    getRunGovernance: useCase.getRunGovernance
      ? (userId: string, runId: string) => useCase.getRunGovernance!(userId, runId)
      : undefined,
    getRunGovernanceEvidence: useCase.getRunGovernanceEvidence
      ? (userId: string, runId: string, cursor?: string) =>
          useCase.getRunGovernanceEvidence!(userId, runId, cursor)
      : undefined,
  });
};
