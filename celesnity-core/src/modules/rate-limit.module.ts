import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AgentWriteThrottlerGuard } from '@presentation/http/agent-write-throttler.guard';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.getOrThrow<number>('AGENT_WRITE_RATE_WINDOW_MS'),
          limit: config.getOrThrow<number>('AGENT_WRITE_RATE_LIMIT'),
        },
      ],
    }),
  ],
  providers: [
    AgentWriteThrottlerGuard,
    { provide: APP_GUARD, useExisting: AgentWriteThrottlerGuard },
  ],
})
export class RateLimitModule {}
