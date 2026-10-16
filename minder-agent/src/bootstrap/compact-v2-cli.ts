import { PrismaService } from "@infrastructure/prisma/prisma.service.js";
import { compactV2Schema } from "@infrastructure/prisma/schema/compact-v2.js";

const connectionString = process.env.DATABASE_URL?.trim();
const schema = process.env.MINDER_DATABASE_SCHEMA?.trim();
const confirmation = process.env.MINDER_COMPACT_V2_CONFIRM;

if (!connectionString) throw new Error("DATABASE_URL is required.");
if (!schema) throw new Error("MINDER_DATABASE_SCHEMA is required.");
if (!confirmation) throw new Error("MINDER_COMPACT_V2_CONFIRM is required.");

const prisma = new PrismaService({ datasourceUrl: connectionString, schema });
try {
  await compactV2Schema(prisma, schema, confirmation);
  process.stdout.write(`Compact v2 schema applied to ${schema}.\n`);
} catch (error) {
  process.stderr.write(
    `Compact v2 schema failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
