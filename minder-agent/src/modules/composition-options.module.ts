import { Global, Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import type { CompositionOptions } from "@infrastructure/composition";
import { COMPOSITION_OPTIONS } from "./tokens.js";

@Global()
@Module({})
export class CompositionOptionsModule {
  static register(options: CompositionOptions): DynamicModule {
    return {
      module: CompositionOptionsModule,
      providers: [{ provide: COMPOSITION_OPTIONS, useValue: options }],
      exports: [COMPOSITION_OPTIONS],
    };
  }
}
