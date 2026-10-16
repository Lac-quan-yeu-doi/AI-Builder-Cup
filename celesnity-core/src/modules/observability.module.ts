import { Module } from '@nestjs/common';

import { OPERATIONAL_METRICS } from '@application/observability/tokens';
import { operationalMetrics } from '@infrastructure/observability/operational-metrics';
import { MetricsController } from '@presentation/http/metrics.controller';

@Module({
  controllers: [MetricsController],
  providers: [{ provide: OPERATIONAL_METRICS, useValue: operationalMetrics }],
  exports: [OPERATIONAL_METRICS],
})
export class ObservabilityModule {}
