import type { ChatRepository } from '@/src/application/repositories/chat.repository.interface';
import type { SendMessageInput } from '@/src/entities/models/chat';

export type ManageChatUseCase = ReturnType<typeof createManageChatUseCase>;

export const createManageChatUseCase = (repository: ChatRepository) => ({
  sendMessage: (input: SendMessageInput) => repository.sendMessage(input),
  closeRunRegistration: repository.closeRunRegistration
    ? (roomId: string, runId: string) => repository.closeRunRegistration!(roomId, runId)
    : undefined,
  listSessions: (userId: string) => repository.listSessions(userId),
  streamEvents: (userId: string, roomId: string, from?: string, signal?: AbortSignal) =>
    repository.streamEvents(userId, roomId, from, signal),
  streamRunEvents: (userId: string, runId: string, from?: string, signal?: AbortSignal) =>
    repository.streamRunEvents(userId, runId, from, signal),
  getSessionTranscript: (userId: string, roomId: string, agentName?: string) =>
    repository.getSessionTranscript(userId, roomId, agentName),
  getSessionState: (userId: string, roomId: string, agentName?: string) =>
    repository.getSessionState(userId, roomId, agentName),
  getRoomHistory: repository.getRoomHistory
    ? (userId: string, roomId: string) => repository.getRoomHistory!(userId, roomId)
    : undefined,
  resetConversation: (userId: string, roomId: string, agentName: string) =>
    repository.resetConversation(userId, roomId, agentName),
  getSessionTranscriptById: (userId: string, sessionId: string) =>
    repository.getSessionTranscriptById(userId, sessionId),
  checkHealth: () => repository.checkHealth(),
  getRunManifest: (userId: string, runId: string) => repository.getRunManifest(userId, runId),
  getRunTrace: (userId: string, runId: string) => repository.getRunTrace(userId, runId),
  getRunReport: (userId: string, runId: string) => repository.getRunReport(userId, runId),
  getRunValidation: (userId: string, runId: string) => repository.getRunValidation(userId, runId),
  getRoomMetrics: (userId: string, roomId: string) => repository.getRoomMetrics(userId, roomId),
  listRunFiles: (userId: string, runId: string) => repository.listRunFiles(userId, runId),
  getRunFileContent: (userId: string, runId: string, path: string) =>
    repository.getRunFileContent(userId, runId, path),
  listRunApprovals: (userId: string, runId: string) => repository.listRunApprovals(userId, runId),
  decideRunApproval: (
    userId: string,
    runId: string,
    approvalId: string,
    decision: 'approved' | 'denied',
  ) => repository.decideRunApproval(userId, runId, approvalId, decision),
  getRunGovernance: repository.getRunGovernance
    ? (userId: string, runId: string) => repository.getRunGovernance!(userId, runId)
    : undefined,
  getRunGovernanceEvidence: repository.getRunGovernanceEvidence
    ? (userId: string, runId: string, cursor?: string) =>
        repository.getRunGovernanceEvidence!(userId, runId, cursor)
    : undefined,
});
