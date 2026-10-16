import { describe, expect, it, vi } from 'vitest';

import { createManageChatUseCase } from '@/src/application/use-cases/chat/manage-chat.use-case';
import type { ChatRepository } from '@/src/application/repositories/chat.repository.interface';
import type {
  RunFileContent,
  RunFileEntry,
  RunManifest,
  RunReport,
  RunTraceSpan,
  RunValidation,
} from '@/src/entities/models/chat';

function fakeRepository(overrides: Partial<ChatRepository> = {}): ChatRepository {
  return {
    sendMessage: vi.fn(),
    listSessions: vi.fn(),
    streamEvents: vi.fn(),
    streamRunEvents: vi.fn(),
    getSessionTranscript: vi.fn(),
    getSessionState: vi.fn(),
    resetConversation: vi.fn(),
    getSessionTranscriptById: vi.fn(),
    checkHealth: vi.fn(),
    getRunManifest: vi.fn(),
    getRunTrace: vi.fn(),
    getRunReport: vi.fn(),
    getRunValidation: vi.fn(),
    getRoomMetrics: vi.fn(),
    listRunFiles: vi.fn(),
    getRunFileContent: vi.fn(),
    listRunApprovals: vi.fn(),
    decideRunApproval: vi.fn(),
    ...overrides,
  };
}

const manifest = { manifestId: 'manifest-1' } as unknown as RunManifest;
const trace: readonly RunTraceSpan[] = [];
const report: RunReport = { runId: 'run-1', markdown: '# Report' };
const validation = { status: 'valid' } as unknown as RunValidation;
const runFiles: readonly RunFileEntry[] = [
  {
    path: 'a.txt',
    accessType: 'created',
    toolName: 'writer',
    accessedAt: '2026-01-01T00:00:00Z',
    available: true,
  },
];
const runFileContent: RunFileContent = {
  blob: new Blob(['hello']),
  mimeType: 'text/plain',
  sizeBytes: 5,
  fileName: 'a.txt',
};

describe('createManageChatUseCase run observability pass-through', () => {
  it('passes getRunManifest straight through to the repository', async () => {
    const repository = fakeRepository({ getRunManifest: vi.fn().mockResolvedValue(manifest) });
    const useCase = createManageChatUseCase(repository);

    const result = await useCase.getRunManifest('u1', 'run-1');

    expect(repository.getRunManifest).toHaveBeenCalledWith('u1', 'run-1');
    expect(result).toBe(manifest);
  });

  it('passes getRunTrace straight through to the repository', async () => {
    const repository = fakeRepository({ getRunTrace: vi.fn().mockResolvedValue(trace) });
    const useCase = createManageChatUseCase(repository);

    const result = await useCase.getRunTrace('u1', 'run-1');

    expect(repository.getRunTrace).toHaveBeenCalledWith('u1', 'run-1');
    expect(result).toBe(trace);
  });

  it('passes getRunReport straight through to the repository', async () => {
    const repository = fakeRepository({ getRunReport: vi.fn().mockResolvedValue(report) });
    const useCase = createManageChatUseCase(repository);

    const result = await useCase.getRunReport('u1', 'run-1');

    expect(repository.getRunReport).toHaveBeenCalledWith('u1', 'run-1');
    expect(result).toBe(report);
  });

  it('passes getRunValidation straight through to the repository', async () => {
    const repository = fakeRepository({ getRunValidation: vi.fn().mockResolvedValue(validation) });
    const useCase = createManageChatUseCase(repository);

    const result = await useCase.getRunValidation('u1', 'run-1');

    expect(repository.getRunValidation).toHaveBeenCalledWith('u1', 'run-1');
    expect(result).toBe(validation);
  });

  it('passes listRunFiles straight through to the repository', async () => {
    const repository = fakeRepository({ listRunFiles: vi.fn().mockResolvedValue(runFiles) });
    const useCase = createManageChatUseCase(repository);

    const result = await useCase.listRunFiles('u1', 'run-1');

    expect(repository.listRunFiles).toHaveBeenCalledWith('u1', 'run-1');
    expect(result).toBe(runFiles);
  });

  it('passes getRunFileContent straight through to the repository', async () => {
    const repository = fakeRepository({
      getRunFileContent: vi.fn().mockResolvedValue(runFileContent),
    });
    const useCase = createManageChatUseCase(repository);

    const result = await useCase.getRunFileContent('u1', 'run-1', 'a.txt');

    expect(repository.getRunFileContent).toHaveBeenCalledWith('u1', 'run-1', 'a.txt');
    expect(result).toBe(runFileContent);
  });

  it('passes getSessionTranscriptById straight through to the repository', async () => {
    const transcript = [{ role: 'user', content: 'hi', reasoning: null }] as const;
    const repository = fakeRepository({
      getSessionTranscriptById: vi.fn().mockResolvedValue(transcript),
    });
    const useCase = createManageChatUseCase(repository);

    const result = await useCase.getSessionTranscriptById('u1', 'session-1');

    expect(repository.getSessionTranscriptById).toHaveBeenCalledWith('u1', 'session-1');
    expect(result).toBe(transcript);
  });

  it('passes durable session state straight through to the repository', async () => {
    const state = {
      transcript: [{ role: 'user' as const, content: 'Create a report', reasoning: null }],
      pendingQuestion: {
        question: 'Which format?',
        options: [],
        allowOther: true,
      },
    };
    const repository = fakeRepository({ getSessionState: vi.fn().mockResolvedValue(state) });
    const useCase = createManageChatUseCase(repository);

    const result = await useCase.getSessionState('u1', 'room-1', 'chat-assistant');

    expect(repository.getSessionState).toHaveBeenCalledWith('u1', 'room-1', 'chat-assistant');
    expect(result).toBe(state);
  });
});

describe('createManageChatUseCase.sendMessage', () => {
  it('forwards an optional agent override straight through to the repository', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const repository = fakeRepository({ sendMessage });
    const useCase = createManageChatUseCase(repository);

    await useCase.sendMessage({
      userId: 'user-1',
      roomId: null,
      message: 'add a step',
      sessionKey: 'workflow-wf-1',
      agent: 'automation-workflow-editor',
    });

    expect(sendMessage).toHaveBeenCalledWith({
      userId: 'user-1',
      roomId: null,
      message: 'add a step',
      sessionKey: 'workflow-wf-1',
      agent: 'automation-workflow-editor',
    });
  });
});
