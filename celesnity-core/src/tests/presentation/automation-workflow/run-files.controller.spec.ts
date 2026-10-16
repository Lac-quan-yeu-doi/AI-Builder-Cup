import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';

import type { IRunOwnershipResolver } from '@application/automation-workflow/interfaces/i-run-ownership-resolver';
import type {
  IAgentRunFilesClient,
  RunFileContent,
  RunFileEntryDto,
} from '@application/automation-workflow/interfaces/i-agent-run-files-client';
import { setAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { RunFilesController } from '@presentation/automation-workflow/run-files.controller';

function requestForOrg(organizationId: string): Request {
  const req = {} as Request;
  setAuthenticatedPrincipal(req, {
    identityId: 'user-1',
    subject: 'user-1',
    identityTenantId: 'tenant-1',
    organizationId,
    organizationStatus: 'ACTIVE',
    mfaRequired: false,
    membershipId: 'membership-1',
    role: 'ORG_ADMIN',
    authenticationTime: 0,
    mfaVerified: true,
  });
  return req;
}

function fakeResponse(): Response & { headers: Record<string, unknown> } {
  const headers: Record<string, unknown> = {};
  return {
    headers,
    setHeader: jest.fn((name: string, value: unknown) => {
      headers[name] = value;
    }),
  } as unknown as Response & { headers: Record<string, unknown> };
}

function buildController(
  clientOverrides: Partial<IAgentRunFilesClient> = {},
  ownershipOverrides: Partial<IRunOwnershipResolver> = {},
): {
  controller: RunFilesController;
  client: IAgentRunFilesClient;
  ownership: IRunOwnershipResolver;
} {
  const client = clientOverrides as unknown as IAgentRunFilesClient;
  const ownership = ownershipOverrides as unknown as IRunOwnershipResolver;
  const controller = new RunFilesController(client, ownership);
  return { controller, client, ownership };
}

const sampleEntry: RunFileEntryDto = {
  path: 'out/report.txt',
  accessType: 'created',
  toolName: 'writer',
  accessedAt: '2026-09-08T00:00:00.000Z',
  available: true,
  sizeBytes: 12,
  mimeType: 'text/plain',
};

describe('RunFilesController', () => {
  it('returns 403 and never calls the agent when the run is not owned by the org', async () => {
    const listFiles = jest.fn(async () => [sampleEntry]);
    const ownsRun = jest.fn(async () => false);
    const { controller } = buildController({ listFiles }, { ownsRun });

    await expect(controller.listFiles('run-1', requestForOrg('org-2'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ownsRun).toHaveBeenCalledWith('run-1', 'org-2');
    expect(listFiles).not.toHaveBeenCalled();
  });

  it('lists files when the run is owned', async () => {
    const listFiles = jest.fn(async () => [sampleEntry]);
    const ownsRun = jest.fn(async () => true);
    const { controller } = buildController({ listFiles }, { ownsRun });

    const response = await controller.listFiles('run-1', requestForOrg('org-1'));

    expect(ownsRun).toHaveBeenCalledWith('run-1', 'org-1');
    expect(listFiles).toHaveBeenCalledWith('run-1');
    expect(response.files).toEqual([
      expect.objectContaining({
        path: 'out/report.txt',
        accessType: 'created',
        toolName: 'writer',
        available: true,
      }),
    ]);
  });

  it('rejects a path-traversal request with 400 before any ownership or agent call', async () => {
    const getFileContent = jest.fn(async () => undefined);
    const ownsRun = jest.fn(async () => true);
    const { controller } = buildController({ getFileContent }, { ownsRun });

    await expect(
      controller.getContent('run-1', '../x', '0', requestForOrg('org-1'), fakeResponse()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ownsRun).not.toHaveBeenCalled();
    expect(getFileContent).not.toHaveBeenCalled();
  });

  it('streams file content and sets response headers when owned', async () => {
    const content: RunFileContent = {
      body: Readable.toWeb(Readable.from(['x'])) as ReadableStream<Uint8Array>,
      contentType: 'text/plain',
      contentLength: 1,
      fileName: 'report.txt',
    };
    const getFileContent = jest.fn(async () => content);
    const ownsRun = jest.fn(async () => true);
    const { controller } = buildController({ getFileContent }, { ownsRun });
    const res = fakeResponse();

    const result = await controller.getContent(
      'run-1',
      'out/report.txt',
      '1',
      requestForOrg('org-1'),
      res,
    );

    expect(getFileContent).toHaveBeenCalledWith('run-1', 'out/report.txt', true);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="report.txt"',
    );
    expect(result).toBeDefined();
  });
});
