import { MessageBlockUseCases } from '@application/message-block/message-block.use-cases';
import type { IMessageBlockRepository } from '@application/message-block/interfaces/i-message-block.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';

function buildUseCases(
  overrides: {
    repository?: Partial<IMessageBlockRepository>;
  } = {},
) {
  const repository: IMessageBlockRepository = {
    bindRoom: jest.fn(async () => undefined),
    create: jest.fn(async (block) => block),
    listByRoom: jest.fn(async () => []),
    ...overrides.repository,
  };
  const clock: IClock = { now: () => new Date('2026-08-18T00:00:00.000Z') };
  const ids: IIdGenerator = { next: () => 'block-1' };
  const contexts = {
    require: () => ({
      organizationId: '10000000-0000-4000-8000-000000000001',
      identityId: '20000000-0000-4000-8000-000000000001',
      mfaVerified: true,
    }),
  } as unknown as AuthenticatedContextStore;
  return { useCases: new MessageBlockUseCases(repository, clock, ids, contexts), repository };
}

describe('MessageBlockUseCases.bindRoom', () => {
  it('passes only the verified request principal to the room binding', async () => {
    const { useCases, repository } = buildUseCases();
    await useCases.bindRoom(' room-1 ', 'chat-assistant');
    expect(repository.bindRoom).toHaveBeenCalledWith('room-1', 'chat-assistant', {
      organizationId: '10000000-0000-4000-8000-000000000001',
      identityId: '20000000-0000-4000-8000-000000000001',
      mfaVerified: true,
    });
  });
});

describe('MessageBlockUseCases.publish', () => {
  it('rejects an unsupported block_type before touching the repository', async () => {
    const { useCases, repository } = buildUseCases();
    await expect(
      useCases.publish({
        roomId: 'room-1',
        blockType: 'video',
        payload: { foo: 'bar' },
        fallbackText: 'fallback',
      }),
    ).rejects.toMatchObject({ name: 'MessageBlockError' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a non-object payload', async () => {
    const { useCases, repository } = buildUseCases();
    await expect(
      useCases.publish({
        roomId: 'room-1',
        blockType: 'text',
        payload: null as unknown as Record<string, unknown>,
        fallbackText: 'fallback',
      }),
    ).rejects.toMatchObject({ name: 'MessageBlockError' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects blank fallback_text', async () => {
    const { useCases, repository } = buildUseCases();
    await expect(
      useCases.publish({
        roomId: 'room-1',
        blockType: 'text',
        payload: { text: 'hi' },
        fallbackText: '   ',
      }),
    ).rejects.toMatchObject({ name: 'MessageBlockError' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('defaults version to 1 and runId to null, and persists via the repository', async () => {
    const { useCases, repository } = buildUseCases();
    const block = await useCases.publish({
      roomId: 'room-1',
      blockType: 'text',
      payload: { text: 'hi' },
      fallbackText: 'hi',
    });
    expect(block).toMatchObject({
      id: 'block-1',
      roomId: 'room-1',
      runId: null,
      blockType: 'text',
      version: 1,
      publishedAt: '2026-08-18T00:00:00.000Z',
    });
    expect(repository.create).toHaveBeenCalledWith(block);
  });

  it('passes through an explicit runId and version', async () => {
    const { useCases } = buildUseCases();
    const block = await useCases.publish({
      roomId: 'room-1',
      runId: 'run-9',
      blockType: 'chart',
      version: 1,
      payload: { chartType: 'bar', title: 't', columns: [], rows: [] },
      fallbackText: 'a chart',
    });
    expect(block.runId).toBe('run-9');
    expect(block.version).toBe(1);
  });
});

describe('MessageBlockUseCases.listByRoom', () => {
  it('forwards roomId, cursor, and a default limit of 50 to the repository', async () => {
    const { useCases, repository } = buildUseCases();
    await useCases.listByRoom('room-1');
    expect(repository.listByRoom).toHaveBeenCalledWith(
      'room-1',
      '10000000-0000-4000-8000-000000000001',
      undefined,
      50,
    );
  });

  it('forwards an explicit cursor and limit', async () => {
    const { useCases, repository } = buildUseCases();
    await useCases.listByRoom('room-1', 'cursor-abc', 10);
    expect(repository.listByRoom).toHaveBeenCalledWith(
      'room-1',
      '10000000-0000-4000-8000-000000000001',
      'cursor-abc',
      10,
    );
  });
});
