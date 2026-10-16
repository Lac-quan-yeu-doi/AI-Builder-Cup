import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// start-dev.sh belongs to the parent minder-sys workspace, not this repo.
// Set this explicitly when that external workspace is available to preserve
// the orchestration coverage without copying the parent script here.
const parentWorkspaceRoot = process.env.MINDER_PARENT_WORKSPACE_ROOT;
const script = parentWorkspaceRoot
  ? resolve(parentWorkspaceRoot, "start-dev.sh")
  : undefined;
const hasParentWorkspaceFixture = script !== undefined && existsSync(script);

describe("start-dev.sh (external parent workspace)", () => {
  it.skipIf(!hasParentWorkspaceFixture)(
    "previews every hot-reload application service without launching infrastructure or exposing secrets",
    () => {
      const output = execFileSync(
        "bash",
        [script!, "--no-infra", "--dry-run"],
        {
          cwd: parentWorkspaceRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            LLM_BASE_URL: "http://localhost:11434/v1",
            LLM_API_KEY: "test-secret-must-not-appear",
            LLM_MODEL: "test-model",
          },
        },
      );

      expect(output).toContain("celesnity-api: npm run start:dev");
      expect(output).toContain("celesnity-worker: npm run start:worker:dev");
      expect(output).toContain("minder-agent: npm run dev");
      expect(output).toContain("celesnity-web: npm run dev");
      expect(output).not.toContain("test-secret-must-not-appear");
    },
  );
});
