import { Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Mutations are rate limited by the standard authenticated request tracker.
 * Reads are exempt. No shared bearer secret is inspected or granted a special
 * bucket; machine routes authenticate through their dedicated workload guard.
 */
@Injectable()
export class AgentWriteThrottlerGuard extends ThrottlerGuard {
  public constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ method?: string }>();
    return Promise.resolve(!MUTATING_METHODS.has(request.method ?? ''));
  }
}
