import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule, CLI_RUNNER, type CliRunner } from "./app.module.js";

export async function bootstrapCli(
  argv: string[],
  environment: NodeJS.ProcessEnv,
): Promise<number> {
  const app = await NestFactory.createApplicationContext(
    AppModule.registerCli({ environment, factories: {} }),
    { logger: ["error"] },
  );
  try {
    return await app.get<CliRunner>(CLI_RUNNER).run(argv, environment);
  } finally {
    await app.close();
  }
}
