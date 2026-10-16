import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { MessageBlockError } from '@domain/message-block/errors/message-block.errors';
import type { Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { MessageBlockModule } from '@modules/message-block.module';
import { OPERATIONAL_METRICS } from '@application/observability/tokens';
import type { Request, Response } from 'express';
import { createHttpRequestLoggingMiddleware } from '@presentation/http/http-request-logging.middleware';
import { MessageBlockUseCases } from '@application/message-block/message-block.use-cases';
import { MessageBlockStreamWriter } from '@presentation/message-block/message-block-stream.writer';
import { MessageBlockStreamAdmission } from '@presentation/message-block/message-block-stream.admission';
import { MessageBlockStreamLifecycle } from '@presentation/message-block/message-block-stream.lifecycle';
import {
  MessageBlockSseTransport,
  OversizedSseFrame,
} from '@presentation/message-block/message-block-sse.transport';

// Only the stream providers are assembled here; authentication is exercised by its own suites.
jest.mock('@modules/security.module', () => ({ SecurityModule: class {} }));

class FakeResponse extends EventEmitter {
  frames: string[] = [];
  destroyed = false;
  writableEnded = false;
  statusCode = 200;
  blocked = false;
  headers = new Map<string, string>();
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  setHeader(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }
  json(data: unknown) {
    this.frames.push(JSON.stringify(data));
    this.end();
  }
  flushHeaders() {}
  write(frame: string) {
    this.frames.push(frame);
    return !this.blocked;
  }
  end() {
    this.writableEnded = true;
    this.emit('finish');
    this.emit('close');
  }
  destroy() {
    this.destroyed = true;
    this.emit('close');
  }
}
const block = (id: string) => ({
  id,
  roomId: 'room',
  runId: null,
  blockType: 'text',
  version: 1,
  payload: {},
  fallbackText: id,
  publishedAt: '2026-09-29T00:00:00.000Z',
});
const metrics = () => ({
  contentType: '',
  metrics: async () => '',
  requestStarted: jest.fn(),
  requestCompleted: jest.fn(),
  messageBlockReadCount: jest.fn(),
  messageBlockOpened: jest.fn(),
  messageBlockClosed: jest.fn(),
  messageBlockRejected: jest.fn(),
  workflowRunProgressStreamOpened: jest.fn(),
  workflowRunProgressStreamClosed: jest.fn(),
  agentRunEventReconnect: jest.fn(),
  agentRunEventFallbackPoll: jest.fn(),
  automationProgressAppendFailure: jest.fn(),
  automationCompletionToNextStep: jest.fn(),
});
const createStream = (read: jest.Mock, measured = metrics()) => {
  const admission = new MessageBlockStreamAdmission(measured);
  const lifecycle = new MessageBlockStreamLifecycle(
    { listByRoom: read } as unknown as MessageBlockUseCases,
    admission,
  );
  const transport = new MessageBlockSseTransport();
  return { writer: new MessageBlockStreamWriter(lifecycle, transport), admission, lifecycle };
};
const setup = (read = jest.fn().mockResolvedValue([])) => {
  const measured = metrics();
  const { writer, admission, lifecycle } = createStream(read, measured);
  const response = new FakeResponse();
  const done = writer.stream(response as unknown as Response, 'room', 'org', 'identity');
  return { writer, admission, lifecycle, response, done, read, measured };
};

describe('Message-block stream lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('signals an invalid cursor as a reset and completes normally without advancing it', async () => {
    const error = MessageBlockError.invalidCursor();
    const test = setup(jest.fn().mockRejectedValue(error));
    await jest.advanceTimersByTimeAsync(0);
    await test.done;
    expect(test.response.frames.join('')).toContain('event: stream_reset');
    expect(test.response.frames.join('')).toContain('"recovery":"reload_room_state"');
    expect(test.response.frames.join('')).not.toContain('event: message_block');
    expect(test.response.writableEnded).toBe(true);
    expect(test.response.statusCode).toBe(200);
    expect(test.measured.messageBlockClosed).toHaveBeenCalledWith('cursor_reset');
    expect(test.admission.active).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('does not relabel a known read failure as rotation when its error frame is still draining at the deadline', async () => {
    let rejectRead: ((reason: Error) => void) | undefined;
    const test = setup(
      jest.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectRead = reject;
          }),
      ),
    );
    await jest.advanceTimersByTimeAsync(239_000);
    test.response.blocked = true;
    rejectRead?.(new Error('Database unavailable'));
    await jest.advanceTimersByTimeAsync(1_000);
    await test.done;
    expect(test.measured.messageBlockClosed).toHaveBeenCalledTimes(1);
    expect(test.measured.messageBlockClosed).toHaveBeenCalledWith('error');
    expect(test.response.frames.some((frame) => frame.includes('event: stream_end'))).toBe(false);
    expect(test.admission.active).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('logs one correlated close record after a disconnect', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const { writer, admission } = createStream(jest.fn().mockResolvedValue([]));
      const response = new FakeResponse();
      const done = writer.stream(
        response as unknown as Response,
        'room',
        'org',
        'identity',
        undefined,
        'request-1',
      );
      await jest.advanceTimersByTimeAsync(0);
      response.destroy();
      await done;
      const close = log.mock.calls
        .map(([message]) => (typeof message === 'string' ? JSON.parse(message) : undefined))
        .filter((entry) => entry?.event === 'message_block_stream_closed');
      expect(close).toEqual([
        expect.objectContaining({
          requestId: 'request-1',
          roomId: 'room',
          reason: 'disconnect',
          deliveredBlocks: 0,
        }),
      ]);
      expect(admission.active).toBe(0);
    } finally {
      log.mockRestore();
    }
  });
  it('catches up one block at a time and advances only the delivered cursor', async () => {
    const read = jest
      .fn()
      .mockResolvedValueOnce([block('a')])
      .mockResolvedValueOnce([block('b')])
      .mockResolvedValue([]);
    const test = setup(read);
    await jest.advanceTimersByTimeAsync(0);
    expect(read.mock.calls).toEqual([
      ['room', undefined, 1],
      ['room', 'a', 1],
      ['room', 'b', 1],
    ]);
    expect(
      test.response.frames.filter((frame) => frame.startsWith('event: message_block')),
    ).toHaveLength(2);
    test.response.destroy();
    await test.done;
    expect(jest.getTimerCount()).toBe(0);
  });
  it('rotates normally at 240 seconds with heartbeats and releases exactly once', async () => {
    const test = setup();
    await jest.advanceTimersByTimeAsync(240_000);
    await test.done;
    expect(test.response.statusCode).toBe(200);
    expect(test.response.writableEnded).toBe(true);
    expect(test.response.frames.at(-1)).toContain('event: stream_end');
    expect(
      test.response.frames.filter((frame) => frame.includes('heartbeat')).length,
    ).toBeGreaterThanOrEqual(15);
    expect(test.admission.active).toBe(0);
    expect(test.measured.messageBlockClosed).toHaveBeenCalledTimes(1);
    expect(test.measured.messageBlockClosed).toHaveBeenCalledWith('rotation');
    expect(jest.getTimerCount()).toBe(0);
  });
  it('keeps its admission slot until the final HTTP response actually finishes', async () => {
    const test = setup();
    test.response.end = () => {
      test.response.writableEnded = true;
    };
    await jest.advanceTimersByTimeAsync(240_000);
    expect(test.response.frames.at(-1)).toContain('event: stream_end');
    expect(test.admission.active).toBe(1);
    expect(test.measured.messageBlockClosed).not.toHaveBeenCalled();
    test.response.emit('finish');
    await test.done;
    expect(test.admission.active).toBe(0);
    expect(test.measured.messageBlockClosed).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('registers shared admission and shutdown cleanup through the production Nest providers', async () => {
    const tokens = [
      MessageBlockStreamAdmission,
      MessageBlockStreamLifecycle,
      MessageBlockSseTransport,
      MessageBlockStreamWriter,
    ];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MessageBlockModule,
    ) as Provider[];
    const measured = metrics();
    const module = await Test.createTestingModule({
      providers: [
        ...providers.filter((provider) =>
          tokens.some(
            (token) => token === (typeof provider === 'function' ? provider : provider.provide),
          ),
        ),
        {
          provide: MessageBlockUseCases,
          useValue: { listByRoom: jest.fn().mockResolvedValue([]) },
        },
        { provide: OPERATIONAL_METRICS, useValue: measured },
      ],
    }).compile();
    const admission = module.get(MessageBlockStreamAdmission);
    const writer = module.get(MessageBlockStreamWriter);
    const response = new FakeResponse();
    const done = writer.stream(response as unknown as Response, 'room', 'org', 'identity');
    try {
      await jest.advanceTimersByTimeAsync(0);
      expect(admission.active).toBe(1);
    } finally {
      await module.close();
      await done;
    }
    expect(admission.active).toBe(0);
    expect(measured.messageBlockClosed).toHaveBeenCalledTimes(1);
    expect(measured.messageBlockClosed).toHaveBeenCalledWith('shutdown');
    const rejected = new FakeResponse();
    await writer.stream(rejected as unknown as Response, 'room', 'org', 'identity');
    expect(rejected.statusCode).toBe(503);
    expect(rejected.headers.get('Retry-After')).toBe('10');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops promptly on response closure even when its database read is pending', async () => {
    let settle: ((value: unknown[]) => void) | undefined;
    const read = jest.fn(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    const test = setup(read);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(read).toHaveBeenCalledTimes(1);
    test.response.destroy();
    await test.done;
    settle?.([]);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(test.admission.active).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('stops reading under backpressure and disconnects a consumer unable to drain in 10 seconds', async () => {
    const test = setup(
      jest
        .fn()
        .mockResolvedValueOnce([block('first')])
        .mockResolvedValue([]),
    );
    test.response.blocked = true;
    await jest.advanceTimersByTimeAsync(9_999);
    expect(test.read).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await test.done;
    expect(test.response.destroyed).toBe(true);
    expect(test.measured.messageBlockClosed).toHaveBeenCalledWith('slow_consumer');
    expect(test.admission.active).toBe(0);
  });
  it('resumes reading when drain fires', async () => {
    const test = setup(
      jest
        .fn()
        .mockResolvedValueOnce([block('first')])
        .mockResolvedValue([]),
    );
    test.response.blocked = true;
    await jest.advanceTimersByTimeAsync(5_000);
    test.response.blocked = false;
    test.response.emit('drain');
    await jest.advanceTimersByTimeAsync(0);
    expect(test.read).toHaveBeenCalledTimes(2);
    test.response.destroy();
    await test.done;
    expect(test.response.listenerCount('drain')).toBe(0);
  });
  it('reports oversize without writing the block or advancing its cursor', async () => {
    const read = jest
      .fn()
      .mockResolvedValue([{ ...block('large'), payload: { text: 'x'.repeat(1_048_576) } }]);
    const test = setup(read);
    await jest.advanceTimersByTimeAsync(0);
    await test.done;
    expect(test.response.frames.join('')).toContain('"retryable":false');
    expect(test.response.frames.join('')).not.toContain('event: message_block');
    expect(read.mock.calls).toEqual([['room', undefined, 1]]);
    expect(test.measured.messageBlockClosed).toHaveBeenCalledWith('oversized');
  });
  it('enforces the drain deadline even while reporting an oversized block', async () => {
    const test = setup(
      jest
        .fn()
        .mockResolvedValue([{ ...block('large'), payload: { text: 'x'.repeat(1_048_576) } }]),
    );
    test.response.blocked = true;
    await jest.advanceTimersByTimeAsync(10_000);
    await test.done;
    expect(test.response.destroyed).toBe(true);
    expect(test.admission.active).toBe(0);
    expect(test.measured.messageBlockClosed).toHaveBeenCalledWith('slow_consumer');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('releases slots and listeners even if the final response write throws', async () => {
    const test = setup();
    const write = test.response.write.bind(test.response);
    test.response.write = (frame: string): boolean => {
      if (frame.includes('stream_end')) throw new Error('socket write failed');
      return write(frame);
    };
    await jest.advanceTimersByTimeAsync(240_000);
    await test.done;
    expect(test.admission.active).toBe(0);
    expect(test.measured.messageBlockClosed).toHaveBeenCalledTimes(1);
    expect(test.measured.messageBlockClosed).toHaveBeenCalledWith('error');
    expect(test.response.listenerCount('close')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects before flushing headers or reading the database', async () => {
    const read = jest.fn();
    const measured = metrics();
    const { writer, admission } = createStream(read, measured);
    const slots = Array.from({ length: 8 }, () => admission.acquire('org', 'identity'));
    const response = new FakeResponse();
    const flush = jest.spyOn(response, 'flushHeaders');
    await writer.stream(response as unknown as Response, 'room', 'org', 'identity');
    expect(response.statusCode).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('10');
    expect(flush).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(measured.messageBlockRejected).toHaveBeenCalledWith('identity');
    for (const slot of slots) if (typeof slot !== 'string') slot.release('disconnect');
    expect(admission.active).toBe(0);
  });

  it('bounds outstanding database reads during rapid disconnects even before old queries settle', async () => {
    const settle: ((blocks: unknown[]) => void)[] = [];
    const read = jest.fn(
      () =>
        new Promise((resolve) => {
          settle.push(resolve);
        }),
    );
    const measured = metrics();
    const { writer, admission } = createStream(read, measured);
    for (let index = 0; index < 33; index += 1) {
      const response = new FakeResponse();
      const done = writer.stream(response as unknown as Response, 'room', 'org', 'identity');
      await jest.advanceTimersByTimeAsync(0);
      if (index < 32) expect(response.statusCode).toBe(200);
      else expect(response.statusCode).toBe(429);
      response.destroy();
      await done;
    }
    expect(read).toHaveBeenCalledTimes(32);
    expect(admission.active).toBe(0);
    for (const resolve of settle) resolve([]);
    await jest.advanceTimersByTimeAsync(0);
    expect(measured.messageBlockReadCount).toHaveBeenLastCalledWith(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('shutdown closes subscriptions and releases resources without cancelling runs', async () => {
    const test = setup();
    await jest.advanceTimersByTimeAsync(0);
    test.lifecycle.onModuleDestroy();
    await test.done;
    expect(test.measured.messageBlockClosed).toHaveBeenCalledWith('shutdown');
    expect(test.admission.active).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('Process-local admission', () => {
  it('accepts eight tabs, rejects the ninth, and reuses the slot after a tab closes', () => {
    const admission = new MessageBlockStreamAdmission(metrics());
    const slots = Array.from({ length: 8 }, () => admission.acquire('org', 'identity'));
    expect(slots.every((slot) => typeof slot !== 'string')).toBe(true);
    expect(admission.acquire('org', 'identity')).toBe('identity');
    const first = slots[0];
    if (first && typeof first !== 'string') {
      first.release('disconnect');
      first.release('disconnect');
    }
    expect(typeof admission.acquire('org', 'identity')).not.toBe('string');
    expect(admission.active).toBe(8);
  });
  it('enforces organization independently of identity', () => {
    const admission = new MessageBlockStreamAdmission(metrics());
    for (let index = 0; index < 16; index++)
      expect(typeof admission.acquire('org', `identity-${index}`)).not.toBe('string');
    expect(admission.acquire('org', 'another')).toBe('organization');
    expect(typeof admission.acquire('other-org', 'another')).not.toBe('string');
  });
  it('enforces the pod cap across organizations', () => {
    const admission = new MessageBlockStreamAdmission(metrics());
    for (let index = 0; index < 32; index++) admission.acquire(`org-${index}`, `identity-${index}`);
    expect(admission.acquire('another', 'another')).toBe('pod');
  });
});

describe('SSE transport adapter', () => {
  it('limits UTF-8 encoded bytes before queuing or writing an oversized frame', () => {
    const response = new FakeResponse();
    const connection = new MessageBlockSseTransport().create(response as unknown as Response);
    const payload = { text: '界'.repeat(400_000) };
    expect(JSON.stringify(payload).length).toBeLessThan(1_048_576);
    expect(() => connection.send('message_block', payload, new AbortController().signal)).toThrow(
      OversizedSseFrame,
    );
    expect(response.frames).toEqual([]);
  });
});

describe('Real HTTP cancellation', () => {
  it('admits eight connections, rejects the ninth, and stops polling when fetch readers are cancelled', async () => {
    const { createServer } = await import('node:http');
    const read = jest.fn().mockResolvedValue([]);
    const measured = metrics();
    const { writer, admission, lifecycle } = createStream(read, measured);
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const pending: Promise<void>[] = [];
    const server = createServer((request, response) => {
      const adapted = Object.assign(response, {
        status: (code: number) => {
          response.statusCode = code;
          return response;
        },
        json: (body: unknown) => response.end(JSON.stringify(body)),
      });
      const req = Object.assign(request, {
        method: 'GET',
        path: '/stream',
        originalUrl: '/stream',
        get: (name: string) => request.headers[name.toLowerCase()],
      });
      createHttpRequestLoggingMiddleware(logger, measured)(
        req as unknown as Request,
        adapted as unknown as Response,
        () => {
          pending.push(
            writer.stream(
              adapted as unknown as Response,
              'room',
              'org',
              'identity',
              undefined,
              request.headers['x-request-id'],
            ),
          );
        },
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    try {
      const url = `http://127.0.0.1:${address.port}/stream`;
      const consumers = Array.from({ length: 8 }, () => new AbortController());
      const connections = await Promise.all(
        consumers.map((consumer) => fetch(url, { signal: consumer.signal })),
      );
      expect(connections.every((response) => response.status === 200)).toBe(true);
      const rejected = await fetch(url);
      expect(rejected.status).toBe(429);
      expect(rejected.headers.get('retry-after')).toBe('10');
      await rejected.body?.cancel();
      expect(admission.active).toBe(8);
      await Promise.all(
        connections.map((response) => response.body?.cancel() ?? Promise.resolve()),
      );
      consumers.forEach((consumer) => consumer.abort());
      await Promise.all(pending);
      expect(admission.active).toBe(0);
      expect(measured.messageBlockClosed).toHaveBeenCalledTimes(8);
      expect(measured.requestCompleted).toHaveBeenCalledTimes(9);
      const completed = logger.log.mock.calls
        .map(([entry]) => JSON.parse(entry))
        .filter((entry) => entry.event === 'http_request_completed');
      expect(completed).toHaveLength(8);
      expect(
        completed.every(
          (entry) =>
            entry.status === 499 &&
            entry.responseStatus === 200 &&
            entry.outcome === 'client_disconnected',
        ),
      ).toBe(true);
      expect(logger.warn).toHaveBeenCalledTimes(1); // ninth stream admission rejection
      const count = read.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      expect(read).toHaveBeenCalledTimes(count);
    } finally {
      lifecycle.onModuleDestroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15_000);
});
