import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';

import { AgentWriteThrottlerGuard } from '@presentation/http/agent-write-throttler.guard';

function buildGuard(): AgentWriteThrottlerGuard {
  return new AgentWriteThrottlerGuard(
    {} as ThrottlerModuleOptions,
    {} as ThrottlerStorage,
    {} as Reflector,
  );
}

function contextFor(method: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  } as unknown as ExecutionContext;
}

describe('AgentWriteThrottlerGuard', () => {
  describe('shouldSkip', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('skips throttling for %s requests', async (method) => {
      const guard = buildGuard();
      await expect(guard['shouldSkip'](contextFor(method))).resolves.toBe(true);
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('throttles %s requests', async (method) => {
      const guard = buildGuard();
      await expect(guard['shouldSkip'](contextFor(method))).resolves.toBe(false);
    });
  });
});
