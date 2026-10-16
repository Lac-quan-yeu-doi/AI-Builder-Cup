import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Nest dev-runtime constructor injection", () => {
  it("resolves the v2 delegate controllers when loaded through tsx", () => {
    const script = `
      import "reflect-metadata";
      const [{ AppModule }, { createHttpApplication }, { createOpenApiDocument }, { RunsV2Controller }, { EventsV2Controller }, { GovernanceV2Controller }] = await Promise.all([
        import("./src/bootstrap/app.module.ts"),
        import("./src/bootstrap/http-main.ts"),
        import("./src/presentation/http/openapi/document.ts"),
        import("./src/presentation/http/v2/runs.controller.ts"),
        import("./src/presentation/http/v2/events.controller.ts"),
        import("./src/presentation/http/v2/governance.controller.ts"),
      ]);
      const app = await createHttpApplication(AppModule.register({ environment: {}, factories: {} }));
      try {
        await app.init();
        const runs = app.get(RunsV2Controller);
        const events = app.get(EventsV2Controller);
        const governance = app.get(GovernanceV2Controller);
        const openapi = createOpenApiDocument(app);
        console.log(JSON.stringify({
          runs: runs.turns !== undefined && runs.runs !== undefined,
          events: events.eventsController !== undefined,
          governance: governance.governance !== undefined,
          openapi: JSON.stringify(openapi).length > 0,
        }));
      } finally {
        await app.close();
      }
    `;
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(JSON.parse(output)).toEqual({
      runs: true,
      events: true,
      governance: true,
      openapi: true,
    });
  });
});
