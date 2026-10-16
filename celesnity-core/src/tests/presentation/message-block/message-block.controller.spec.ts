import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';

import { AGENT_SERVICE_ACCESS_REPOSITORY } from '@application/administration/agent-service-access.repository';
import { MessageBlockUseCases } from '@application/message-block/message-block.use-cases';
import { MessageBlockStreamWriter } from '@presentation/message-block/message-block-stream.writer';
import { MessageBlockController } from '@presentation/message-block/message-block.controller';
import { McpSharedSecretGuard } from '@presentation/mcp/mcp-shared-secret.guard';
import { AgentServiceGuard } from '@presentation/http/agent-service.guard';

const AGENT_ID_TOKEN = 'google-signed-agent-id-token';
const AGENT_SERVICE_ACCOUNT_EMAIL = 'celesnity-agent@example.iam.gserviceaccount.com';
const MCP_SHARED_SECRET = 'local-message-block-test-secret';

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(({ idToken }: { idToken: string }) => {
      if (idToken !== AGENT_ID_TOKEN) return Promise.reject(new Error('invalid token'));
      return Promise.resolve({
        getPayload: () => ({
          email: AGENT_SERVICE_ACCOUNT_EMAIL,
          email_verified: true,
          sub: 'agent-service-account-subject',
        }),
      });
    }),
  })),
}));

describe('MessageBlockController', () => {
  let app: INestApplication;
  const publish = jest.fn();
  const listByRoom = jest.fn();
  const bindRoom = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        // Fixed config values instead of the environment, matching the convention in
        // src/tests/modules/module-wiring.spec.ts, so this does not depend on a
        // developer's .env.
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            (): Record<string, string> => ({
              AGENT_SERVICE_AUDIENCE: 'https://core.internal',
              AGENT_SERVICE_ACCOUNT_EMAIL,
              MCP_SHARED_SECRET,
              CELESNITY_AUTH_MODE: 'local-development',
              NODE_ENV: 'development',
            }),
          ],
        }),
      ],
      controllers: [MessageBlockController],
      providers: [
        { provide: MessageBlockStreamWriter, useValue: { stream: jest.fn() } },
        { provide: MessageBlockUseCases, useValue: { publish, listByRoom, bindRoom } },
        McpSharedSecretGuard,
        {
          provide: AGENT_SERVICE_ACCESS_REPOSITORY,
          useValue: {
            resolveRoomPrincipal: jest.fn(async () => ({
              identityId: '20000000-0000-4000-8000-000000000001',
              subject: 'agent-service-account-subject',
              identityTenantId: 'google-workload-identity',
              organizationId: '10000000-0000-4000-8000-000000000001',
              organizationStatus: 'ACTIVE',
              membershipId: '30000000-0000-4000-8000-000000000001',
              role: 'SERVICE_ACCOUNT',
              authenticationTime: 0,
              mfaVerified: true,
              email: AGENT_SERVICE_ACCOUNT_EMAIL,
            })),
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(() => {
    publish.mockReset();
    listByRoom.mockReset();
    bindRoom.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST rejects without a bearer token', async () => {
    await request(app.getHttpServer() as Server)
      .post('/rooms/room-1/message-blocks')
      .send({ block_type: 'text', payload: { text: 'hi' }, fallback_text: 'hi' })
      .expect(401);
    expect(publish).not.toHaveBeenCalled();
  });

  it('POST rejects with the wrong bearer token', async () => {
    await request(app.getHttpServer() as Server)
      .post('/rooms/room-1/message-blocks')
      .set('Authorization', 'Bearer wrong-token')
      .send({ block_type: 'text', payload: { text: 'hi' }, fallback_text: 'hi' })
      .expect(401);
  });

  it('POST succeeds with the correct bearer token', async () => {
    publish.mockResolvedValue({
      id: 'block-1',
      roomId: 'room-1',
      runId: null,
      blockType: 'text',
      version: 1,
      payload: { text: 'hi' },
      fallbackText: 'hi',
      publishedAt: '2026-08-18T00:00:00.000Z',
    });
    const response = await request(app.getHttpServer() as Server)
      .post('/rooms/room-1/message-blocks')
      .set('Authorization', `Bearer ${AGENT_ID_TOKEN}`)
      .send({ block_type: 'text', payload: { text: 'hi' }, fallback_text: 'hi' })
      .expect(201);
    expect(response.body.block_type).toBe('text');
  });

  it('POST succeeds with the local MCP shared secret and a bound room', async () => {
    publish.mockResolvedValue({
      id: 'block-local',
      roomId: 'room-1',
      runId: 'agent-run-1',
      blockType: 'chart',
      version: 1,
      payload: { kind: 'preview' },
      fallbackText: 'Orders chart preview',
      publishedAt: '2026-09-14T00:00:00.000Z',
    });

    const response = await request(app.getHttpServer() as Server)
      .post('/rooms/room-1/message-blocks')
      .set('X-Mcp-Shared-Secret', MCP_SHARED_SECRET)
      .send({
        block_type: 'chart',
        payload: { kind: 'preview' },
        fallback_text: 'Orders chart preview',
        run_id: 'agent-run-1',
      })
      .expect(201);

    expect(response.body.run_id).toBe('agent-run-1');
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'room-1', runId: 'agent-run-1' }),
    );
  });

  it('binds a room to its selected organization agent with a 204 response', async () => {
    bindRoom.mockResolvedValue(undefined);

    const response = await request(app.getHttpServer() as Server)
      .post('/rooms/room-1/message-blocks/bind')
      .send({ agentName: 'chat-assistant' })
      .expect(204);

    expect(response.text).toBe('');
    expect(bindRoom).toHaveBeenCalledWith('room-1', 'chat-assistant');
  });

  it('GET (history) succeeds with no Authorization header at all', async () => {
    listByRoom.mockResolvedValue([]);
    await request(app.getHttpServer() as Server)
      .get('/rooms/room-1/message-blocks')
      .expect(200);
    expect(listByRoom).toHaveBeenCalledWith('room-1', undefined, undefined);
  });
});

describe('AgentServiceGuard production boundary', () => {
  it('does not accept the MCP shared secret when NODE_ENV is production', async () => {
    const config = {
      getOrThrow: (key: string): string =>
        ({
          AGENT_SERVICE_AUDIENCE: 'https://core.internal',
          AGENT_SERVICE_ACCOUNT_EMAIL,
          NODE_ENV: 'production',
        })[key] ?? '',
    } as ConfigService;
    const access = {
      resolveRoomPrincipal: jest.fn(),
      resolveDelegatedRoomPrincipal: jest.fn(),
    };
    const sharedSecret = { canActivate: jest.fn(() => true) } as unknown as McpSharedSecretGuard;
    const guard = new AgentServiceGuard(config, access, sharedSecret);
    const request = { params: { roomId: 'room-1' }, get: () => undefined };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    expect(access.resolveRoomPrincipal).not.toHaveBeenCalled();
  });
});
