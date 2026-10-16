import { expect, test } from "vitest";
import { AppModule } from "../../bootstrap/app.module.js";

test("creates and closes the Nest HTTP application without listening", async () => {
  const { createHttpApplication } =
    await import("../../bootstrap/http-main.js");

  const app = await createHttpApplication(
    AppModule.register({
      environment: {},
      factories: {},
    }),
  );
  await expect(app.close()).resolves.toBeUndefined();
});

test("boots and closes a CLI application context", async () => {
  const { bootstrapCli } = await import("../../bootstrap/cli-main.js");

  await expect(bootstrapCli(["status"], {})).resolves.toBe(2);
});
