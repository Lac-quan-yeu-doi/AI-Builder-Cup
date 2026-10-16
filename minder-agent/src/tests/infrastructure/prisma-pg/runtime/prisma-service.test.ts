import { afterEach, describe, expect, it } from "vitest";
import { PrismaService } from "@infrastructure/prisma/prisma.service.js";

const originalSchema = process.env.MINDER_DATABASE_SCHEMA;

afterEach(() => {
  if (originalSchema === undefined) delete process.env.MINDER_DATABASE_SCHEMA;
  else process.env.MINDER_DATABASE_SCHEMA = originalSchema;
});

describe("PrismaService", () => {
  it("honors an explicit schema without mutating the process environment", async () => {
    delete process.env.MINDER_DATABASE_SCHEMA;
    const prisma = new PrismaService({
      datasourceUrl: "postgres://example.test/minder",
      schema: "tenant_schema",
    });

    const config = prisma as unknown as {
      _engineConfig: {
        overrideDatasources: { db: { url: string } };
      };
    };
    expect(config._engineConfig.overrideDatasources.db.url).toContain(
      "schema=tenant_schema",
    );
    expect(process.env.MINDER_DATABASE_SCHEMA).toBeUndefined();
    await prisma.$disconnect();
  });
});
