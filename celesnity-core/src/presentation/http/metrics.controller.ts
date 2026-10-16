import { Controller, Get, Header, Inject } from '@nestjs/common';

import type { IOperationalMetrics } from '@application/observability/interfaces/i-operational-metrics';
import { OPERATIONAL_METRICS } from '@application/observability/tokens';
import { Public } from './public.decorator';

const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

@Controller('metrics')
export class MetricsController {
  public constructor(
    @Inject(OPERATIONAL_METRICS) private readonly metricsPort: IOperationalMetrics,
  ) {}

  @Get()
  @Public()
  @Header('Content-Type', PROMETHEUS_CONTENT_TYPE)
  metrics(): Promise<string> {
    return this.metricsPort.metrics();
  }
}
