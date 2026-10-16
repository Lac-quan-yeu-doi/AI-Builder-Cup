import { Pool } from "pg";
import { resetMinderSchema } from "@infrastructure/prisma/schema/reset.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new Pool({ connectionString });
try {
  await resetMinderSchema(
    pool,
    process.env.MINDER_RESET_CONFIRM === undefined
      ? {}
      : { confirmation: process.env.MINDER_RESET_CONFIRM },
  );
  process.stdout.write("Minder-owned tables were reset.\n");
} finally {
  await pool.end();
}
