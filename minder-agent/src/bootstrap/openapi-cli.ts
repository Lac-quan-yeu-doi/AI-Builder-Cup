import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import type * as AppModuleSource from "./app.module.js";
import type * as HttpMainSource from "./http-main.js";
import type * as OpenApiSource from "@presentation/http/openapi/document.js";

const output = "docs/api/openapi/minder-agent.yaml";

// tsx does not emit Nest constructor metadata; use the existing TypeScript build.
execFileSync("npm", ["run", "build"], { stdio: "inherit" });
const compiled = (path: string) => pathToFileURL(resolve("dist", path)).href;
const { AppModule } = (await import(
  compiled("bootstrap/app.module.js")
)) as typeof AppModuleSource;
const { createHttpApplication } = (await import(
  compiled("bootstrap/http-main.js")
)) as typeof HttpMainSource;
const { createOpenApiDocument } = (await import(
  compiled("presentation/http/openapi/document.js")
)) as typeof OpenApiSource;

const app = await createHttpApplication(
  AppModule.register({ environment: {}, factories: {} }),
);
try {
  await app.init();
  const document = createOpenApiDocument(app);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, YAML.stringify(document), "utf8");
} finally {
  await app.close();
}
