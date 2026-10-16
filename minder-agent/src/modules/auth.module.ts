import { Module } from "@nestjs/common";
import { createNestAuthOptions } from "@infrastructure/composition";
import { AUTH_OPTIONS, COMPOSITION_OPTIONS } from "./tokens.js";
import { CompositionOptionsModule } from "./composition-options.module.js";

@Module({
  imports: [CompositionOptionsModule],
  providers: [
    {
      provide: AUTH_OPTIONS,
      inject: [{ token: COMPOSITION_OPTIONS, optional: true }],
      useFactory: createNestAuthOptions,
    },
  ],
  exports: [AUTH_OPTIONS],
})
export class AuthModule {}
