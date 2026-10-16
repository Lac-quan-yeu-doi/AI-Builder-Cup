# Runtime and toolchain

- Node.js `>=22.19.0`; npm with committed `package-lock.json`.
- ESM TypeScript runtime; TypeScript 5.9, NestJS 11, Vitest 4.
- Prisma 6 and PostgreSQL are used for optional durable runtime state; without `DATABASE_URL`, run/session/event data is process-local.
- S3-compatible workspace support and MCP integrations are part of the runtime; provider/deployment integrations depend on configuration.
- `npm run dev` starts the HTTP host; `npm run cli -- <task>` starts a CLI task.