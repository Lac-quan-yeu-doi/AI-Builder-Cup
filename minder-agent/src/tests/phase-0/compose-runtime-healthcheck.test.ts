import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The checked-in docker-compose.test.yml is this repo's fixture. The runtime
// healthcheck belongs to the parent workspace, so only inspect it when that
// external fixture is explicitly supplied.
const parentWorkspaceRoot = process.env.MINDER_PARENT_WORKSPACE_ROOT;
const composeFile = parentWorkspaceRoot
  ? resolve(parentWorkspaceRoot, "docker-compose.yaml")
  : undefined;
const hasParentWorkspaceFixture =
  composeFile !== undefined && existsSync(composeFile);
const dockerfile = resolve(import.meta.dirname, "../../../Dockerfile");

describe("local Minder runtime Compose service (external parent workspace)", () => {
  it.skipIf(!hasParentWorkspaceFixture)(
    "uses the Node runtime for its distroless health probe",
    async () => {
      const yaml = await readFile(composeFile!, "utf8");

      expect(yaml).toContain("- /nodejs/bin/node");
      expect(yaml).toContain("fetch('http://127.0.0.1:8080/api/v1/healthz')");
      expect(yaml).not.toContain("/busybox/wget");
      expect(yaml).toContain("minder-migrate:");
      expect(yaml).toContain("condition: service_completed_successfully");
    },
  );

  it("starts the compiled entrypoint so Nest decorator metadata is preserved", async () => {
    const contents = await readFile(dockerfile, "utf8");

    expect(contents).toContain('"dist/bootstrap/http-main.js"');
  });
});
