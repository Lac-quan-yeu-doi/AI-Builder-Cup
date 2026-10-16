import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import * as request from 'supertest';

import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { AgentRunScopeController } from '@presentation/administration/agent-run-scope.controller';
import { DomainExceptionFilter } from '@presentation/http/domain-exception.filter';
import { ProblemDetailsFilter } from '@presentation/http/problem-details.filter';
import { requestValidationException } from '@presentation/http/request-validation.exception';

describe('Agent run registration HTTP contract', () => {
  const roomId = 'c4a39d87-d7a2-4439-a73e-2bc171a1d789';
  const runId = '70b03bb1-a55c-4ca4-a0f7-c77b08d5d9fd';
  const agentName = 'chat-assistant';
  const registerRun = jest.fn<Promise<void>, [string, string, string, { catalog?: string; schema: string } | null]>();
  let server: Server;
  let close: () => Promise<void>;

  beforeEach(async () => {
    registerRun.mockReset().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      controllers: [AgentRunScopeController],
      providers: [{ provide: AgentRoomDelegationService, useValue: { registerRun } }],
    })
      .compile();
    const app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({
      exceptionFactory: requestValidationException,
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }));
    app.useGlobalFilters(new DomainExceptionFilter(new ProblemDetailsFilter()));
    await app.init();
    server = app.getHttpServer() as Server;
    close = async () => app.close();
  });

  afterEach(async () => close());

  it('accepts All databases as an explicit null scope', async () => {
    const response = await request(server).post(`/rooms/${roomId}/agent-runs`).send({ runId, agentName, scope: null });
    expect(response.status).toBe(204);
    expect(registerRun).toHaveBeenCalledWith(roomId, runId, agentName, null);
  });

  it('accepts a selected database scope', async () => {
    const scope = { catalog: 'iceberg', schema: 'orders' };
    const response = await request(server).post(`/rooms/${roomId}/agent-runs`).send({ runId, agentName, scope });
    expect(response.status).toBe(204);
    expect(registerRun).toHaveBeenCalledWith(roomId, runId, agentName, scope);
  });

  it('rejects unknown and malformed scope fields before delegation', async () => {
    const unknown = await request(server).post(`/rooms/${roomId}/agent-runs`).send({
      runId, agentName, scope: { schema: 'orders', unrestricted: true },
    });
    expect(unknown.status).toBe(422);
    const malformed = await request(server).post(`/rooms/${roomId}/agent-runs`).send({
      runId, agentName, scope: { schema: 42 },
    });
    expect(malformed.status).toBe(422);
    expect(registerRun).not.toHaveBeenCalled();
  });

  it('fails closed when scope is omitted or the Agent name is invalid', async () => {
    const missingScope = await request(server).post(`/rooms/${roomId}/agent-runs`).send({ runId, agentName });
    expect(missingScope.status).toBe(422);
    const invalidAgent = await request(server).post(`/rooms/${roomId}/agent-runs`).send({
      runId, agentName: 'not a valid agent', scope: null,
    });
    expect(invalidAgent.status).toBe(422);
    expect(registerRun).not.toHaveBeenCalled();
  });
});
