import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "@bootstrap/app.module.js";
import {
  createCompositionResourceScope,
  createProductionAuthOptions,
  isLlmConfigured,
  normalizePostgresConnectionString,
  normalizeProductionEnvironment,
  type ProductionCompositionFactories,
  type ProductionCompositionOptions,
  type ProductionGraphDependencies,
} from "@infrastructure/composition";
import { PRODUCTION_DEPENDENCIES } from "@modules/tokens.js";
import type { MinderServeDependencies } from "./compatibility-server.js";

export interface ProductionComposition {
  readonly dependencies: MinderServeDependencies;
  shutdown(): Promise<void>;
}

export type { ProductionCompositionFactories, ProductionCompositionOptions };
export {
  createProductionAuthOptions,
  normalizePostgresConnectionString,
  normalizeProductionEnvironment,
};

export async function createProductionComposition(
  options: ProductionCompositionOptions = {},
): Promise<ProductionComposition> {
  const environment = normalizeProductionEnvironment(
    options.environment ?? process.env,
  );
  if (!isLlmConfigured(environment))
    return { dependencies: {}, shutdown: () => Promise.resolve() };

  const resourceScope = createCompositionResourceScope();
  let app:
    | Awaited<ReturnType<typeof NestFactory.createApplicationContext>>
    | undefined;
  try {
    app = await NestFactory.createApplicationContext(
      AppModule.register({
        environment,
        factories: options.factories ?? {},
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        ...(options.authOptions === undefined
          ? {}
          : { authOptions: options.authOptions }),
        resourceScope,
      }),
      { abortOnError: false, logger: ["error"] },
    );
    const dependencies = app.get<ProductionGraphDependencies>(
      PRODUCTION_DEPENDENCIES,
    );
    resourceScope.commit();
    let closed = false;
    return {
      dependencies: dependencies,
      async shutdown() {
        if (closed) return;
        closed = true;
        await app?.close();
      },
    };
  } catch (error) {
    if (app === undefined) {
      await resourceScope.close().catch(() => undefined);
    } else {
      await app.close().catch(() => undefined);
    }
    throw error;
  }
}
