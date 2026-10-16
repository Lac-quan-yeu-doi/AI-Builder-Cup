import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

interface HealthResponse {
  readonly service: 'celesnity-core';
  readonly status: 'alive' | 'ready';
  readonly timestamp: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  public constructor(private readonly config: ConfigService) {}

  /**
   * Unversioned health check for load balancers and container platforms.
   *
   * Served at `/health`, not `/api/v1/health`: `api-main.ts` excludes this one route
   * from the global prefix. Infrastructure health checks should not have to know the
   * API's version, because bumping the prefix would then silently take every backend
   * out of rotation.
   *
   * Answers 200 and nothing else. It deliberately checks no dependency: a load
   * balancer uses this to decide whether to route traffic at all, so failing it over
   * a degraded database would turn a partial outage into a total one. Use
   * `/api/v1/health/ready` where configuration needs asserting.
   */
  @Get()
  @ApiOkResponse({ description: 'The process is serving requests.' })
  public health(): HealthResponse {
    return this.response('alive');
  }

  @Get('live')
  @ApiOkResponse({ description: 'The API process is alive.' })
  public live(): HealthResponse {
    return this.response('alive');
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Required foundation configuration is loaded.' })
  public ready(): HealthResponse {
    this.config.getOrThrow<string>('DATABASE_URL');
    this.config.getOrThrow<string>('MINIO_ENDPOINT');
    this.config.getOrThrow<string>('TRINO_URL');

    return this.response('ready');
  }

  private response(status: HealthResponse['status']): HealthResponse {
    return {
      service: 'celesnity-core',
      status,
      timestamp: new Date().toISOString(),
    };
  }
}
