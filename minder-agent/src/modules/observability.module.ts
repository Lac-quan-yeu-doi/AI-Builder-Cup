import { Module } from "@nestjs/common";
import { createProductionTelemetryProvider } from "@infrastructure/composition";
import { COMPOSITION_OPTIONS, TELEMETRY } from "./tokens.js";
import { CompositionOptionsModule } from "./composition-options.module.js";

@Module({
  imports: [CompositionOptionsModule],
  providers: [
    {
      provide: TELEMETRY,
      inject: [{ token: COMPOSITION_OPTIONS, optional: true }],
      useFactory: createProductionTelemetryProvider,
    },
  ],
  exports: [TELEMETRY],
})
export class ObservabilityModule {}
