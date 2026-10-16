import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const sourceRoot = resolve(process.cwd(), "src");

export default defineConfig({
  resolve: {
    alias: {
      "@domain/index.js": resolve(sourceRoot, "domain/index.ts"),
      "@domain/shared": resolve(sourceRoot, "domain/shared"),
      "@domain/session": resolve(sourceRoot, "domain/session"),
      "@domain/runtime": resolve(sourceRoot, "domain/runtime"),
      "@application": resolve(sourceRoot, "application"),
      "@application/agent": resolve(sourceRoot, "application/agent"),
      "@application/context": resolve(sourceRoot, "application/context"),
      "@application/reliability": resolve(
        sourceRoot,
        "application/reliability",
      ),
      "@application/room": resolve(sourceRoot, "application/room"),
      "@application/runtime": resolve(sourceRoot, "application/runtime"),
      "@application/session": resolve(sourceRoot, "application/session"),
      "@application/skill": resolve(sourceRoot, "application/skill"),
      "@application/agent/index.js": resolve(
        sourceRoot,
        "application/agent/index.ts",
      ),
      "@application/context/index.js": resolve(
        sourceRoot,
        "application/context/index.ts",
      ),
      "@application/reliability/index.js": resolve(
        sourceRoot,
        "application/reliability/index.ts",
      ),
      "@application/room/index.js": resolve(
        sourceRoot,
        "application/room/index.ts",
      ),
      "@application/runtime/index.js": resolve(
        sourceRoot,
        "application/runtime/index.ts",
      ),
      "@application/session/index.js": resolve(
        sourceRoot,
        "application/session/index.ts",
      ),
      "@application/skill/index.js": resolve(
        sourceRoot,
        "application/skill/index.ts",
      ),
      "@application/shared/ports/index.js": resolve(
        sourceRoot,
        "application/shared/ports/index.ts",
      ),
      "@infrastructure/ai": resolve(sourceRoot, "infrastructure/ai"),
      "@infrastructure/agent": resolve(sourceRoot, "infrastructure/agent"),
      "@infrastructure/context": resolve(sourceRoot, "infrastructure/context"),
      "@infrastructure/http": resolve(sourceRoot, "infrastructure/http"),
      "@infrastructure/mcp": resolve(sourceRoot, "infrastructure/mcp"),
      "@infrastructure/workspace": resolve(sourceRoot, "infrastructure/workspace"),
      "@infrastructure/auth": resolve(sourceRoot, "infrastructure/auth"),
      "@infrastructure/configuration": resolve(
        sourceRoot,
        "infrastructure/configuration",
      ),
      "@infrastructure/composition": resolve(
        sourceRoot,
        "infrastructure/composition",
      ),
      "@infrastructure/observability": resolve(
        sourceRoot,
        "infrastructure/observability",
      ),
      "@infrastructure/tools/core": resolve(
        sourceRoot,
        "infrastructure/tools/core",
      ),
      "@infrastructure/tools/impl": resolve(
        sourceRoot,
        "infrastructure/tools/impl",
      ),
      "@infrastructure": resolve(sourceRoot, "infrastructure"),
      "@presentation": resolve(sourceRoot, "presentation"),
      "@modules": resolve(sourceRoot, "modules"),
      "@bootstrap": resolve(sourceRoot, "bootstrap"),
      "@tests": resolve(sourceRoot, "tests"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "architecture",
          include: ["src/tests/architecture/**/*.test.ts"],
          environment: "node",
          pool: "forks",
        },
      },
      {
        extends: true,
        test: {
          name: "compat",
          include: ["src/tests/compat/**/*.test.ts"],
          environment: "node",
          pool: "forks",
        },
      },
      {
        extends: true,
        test: {
          name: "phase-0",
          include: [
            "src/tests/presentation/http/**/*.test.ts",
            "src/tests/phase-0/**/*.test.ts",
          ],
          environment: "node",
          pool: "forks",
        },
      },
      {
        extends: true,
        test: {
          name: "phase-1",
          exclude: [
            "src/tests/infrastructure/prisma-pg/runtime/compact-v2.integration.test.ts",
          ],
          include: [
            "src/tests/application/**/*.test.ts",
            "src/tests/presentation/**/*.test.ts",
            "src/tests/infrastructure/**/*.test.ts",
            "src/tests/phase-1/**/*.test.ts",
          ],
          environment: "node",
          pool: "forks",
        },
      },
      {
        extends: true,
        test: {
          name: "phase-2",
          exclude: [
            "src/tests/infrastructure/prisma-pg/runtime/compact-v2.integration.test.ts",
          ],
          include: [
            "src/tests/infrastructure/**/*.test.ts",
            "src/tests/presentation/cli/**/*.test.ts",
            "src/tests/phase-2/**/*.test.ts",
          ],
          environment: "node",
          pool: "forks",
        },
      },
      {
        extends: true,
        test: {
          name: "phase-3",
          include: [
            "src/tests/application/runtime/**/*.test.ts",
            "src/tests/presentation/http/**/*.test.ts",
            "src/tests/phase-3/**/*.test.ts",
          ],
          environment: "node",
          pool: "forks",
        },
      },
      {
        extends: true,
        test: {
          name: "phase-4",
          include: [
            "src/tests/infrastructure/prisma-pg/runtime/compact-v2.integration.test.ts",
            "src/tests/application/runtime/**/*.test.ts",
            "src/tests/presentation/http/**/*.test.ts",
            "src/tests/phase-4/**/*.test.ts",
          ],
          environment: "node",
          pool: "forks",
        },
      },
      {
        extends: true,
        test: {
          name: "release",
          include: ["src/tests/release/**/*.test.ts"],
          environment: "node",
          pool: "forks",
        },
      },
    ],
  },
});
