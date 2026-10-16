import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';

import type { IRoomOwnershipResolver } from '@application/automation-workflow/interfaces/i-room-ownership-resolver';
import type {
  IWorkspaceTreeClient,
  WorkspaceFileContent,
} from '@application/automation-workflow/interfaces/i-workspace-tree-client';
import { setAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { WorkspaceTreeController } from '@presentation/automation-workflow/workspace-tree.controller';

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
  clientOverrides: Partial<IWorkspaceTreeClient> = {},
  ownershipOverrides: Partial<IRoomOwnershipResolver> = {},
): {
  controller: WorkspaceTreeController;
  client: IWorkspaceTreeClient;
  ownership: IRoomOwnershipResolver;
} {
  const client = clientOverrides as unknown as IWorkspaceTreeClient;
  const ownership = ownershipOverrides as unknown as IRoomOwnershipResolver;
  const controller = new WorkspaceTreeController(client, ownership);
  return { controller, client, ownership };
}

const sampleTree = {
  entries: [
    { path: 'src/main.ts', isDir: false, sizeBytes: 42, modifiedAt: '2026-09-08T00:00:00.000Z' },
  ],
  truncated: false,
};

describe('WorkspaceTreeController', () => {
  it('returns the mapped tree after checking room ownership', async () => {
    const calls: string[] = [];
    const listTree = jest.fn(async () => {
      calls.push('client');
      return sampleTree;
    });
    const ownsRoom = jest.fn(async () => {
      calls.push('ownership');
      return true;
    });
    const { controller } = buildController({ listTree }, { ownsRoom });

    const response = await controller.listTree('room-1', requestForOrg('org-1'));

    expect(response).toEqual(sampleTree);
    expect(ownsRoom).toHaveBeenCalledWith('room-1', 'org-1');
    expect(listTree).toHaveBeenCalledWith('room-1', 'user-1');
    expect(calls).toEqual(['ownership', 'client']);
  });

  it('throws for a cross-org room before calling the client', async () => {
    const listTree = jest.fn(async () => sampleTree);
    const ownsRoom = jest.fn(async () => false);
    const { controller } = buildController({ listTree }, { ownsRoom });

    await expect(controller.listTree('room-1', requestForOrg('org-2'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ownsRoom).toHaveBeenCalledWith('room-1', 'org-2');
    expect(listTree).not.toHaveBeenCalled();
  });

  it('rejects an unsafe content path before ownership or client calls', async () => {
    const getContent = jest.fn(async () => undefined);
    const ownsRoom = jest.fn(async () => true);
    const { controller } = buildController({ getContent }, { ownsRoom });

    await expect(
      controller.getContent(
        'room-1',
        'src/../secret.txt',
        '0',
        requestForOrg('org-1'),
        fakeResponse(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ownsRoom).not.toHaveBeenCalled();
    expect(getContent).not.toHaveBeenCalled();
  });

  it('streams owned content with headers and the download flag', async () => {
    const content: WorkspaceFileContent = {
      body: Readable.toWeb(Readable.from(['x'])) as ReadableStream<Uint8Array>,
      contentType: 'text/plain',
      contentLength: 1,
      fileName: 'main.ts',
    };
    const calls: string[] = [];
    const getContent = jest.fn(async () => {
      calls.push('client');
      return content;
    });
    const ownsRoom = jest.fn(async () => {
      calls.push('ownership');
      return true;
    });
    const { controller } = buildController({ getContent }, { ownsRoom });
    const res = fakeResponse();

    const result = await controller.getContent(
      'room-1',
      'src/main.ts',
      '1',
      requestForOrg('org-1'),
      res,
    );

    expect(getContent).toHaveBeenCalledWith('room-1', 'src/main.ts', true, 'user-1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 1);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="main.ts"',
    );
    expect(result).toBeDefined();
    expect(calls).toEqual(['ownership', 'client']);
  });

  it('rejects unavailable content', async () => {
    const getContent = jest.fn(async () => undefined);
    const ownsRoom = jest.fn(async () => true);
    const { controller } = buildController({ getContent }, { ownsRoom });

    await expect(
      controller.getContent(
        'room-1',
        'src/main.ts',
        undefined,
        requestForOrg('org-1'),
        fakeResponse(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sanitizes the download filename to prevent Content-Disposition header injection', async () => {
    const content: WorkspaceFileContent = {
      body: Readable.toWeb(Readable.from(['x'])) as ReadableStream<Uint8Array>,
      contentType: 'text/plain',
      contentLength: 1,
      // Quotes, backslashes, and CR/LF would break out of the quoted filename param.
      fileName: 'evil".txt\r\nSet-Cookie: a=b',
    };
    const getContent = jest.fn(async () => content);
    const ownsRoom = jest.fn(async () => true);
    const { controller } = buildController({ getContent }, { ownsRoom });
    const res = fakeResponse();

    await controller.getContent('room-1', 'src/main.ts', '1', requestForOrg('org-1'), res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="evil.txtSet-Cookie: a=b"',
    );
  });

  it('falls back to a generic download filename when nothing usable remains', async () => {
    const content: WorkspaceFileContent = {
      body: Readable.toWeb(Readable.from(['x'])) as ReadableStream<Uint8Array>,
      contentType: 'application/octet-stream',
      contentLength: 1,
      fileName: '"""',
    };
    const getContent = jest.fn(async () => content);
    const ownsRoom = jest.fn(async () => true);
    const { controller } = buildController({ getContent }, { ownsRoom });
    const res = fakeResponse();

    await controller.getContent('room-1', 'src/main.ts', '1', requestForOrg('org-1'), res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="download"',
    );
  });
});
