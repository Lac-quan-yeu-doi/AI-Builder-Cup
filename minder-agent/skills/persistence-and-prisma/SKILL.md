---
name: persistence-and-prisma
description: Use when changing Prisma persistence, runtime stores, migrations, transactions, schema mapping, or database integration tests
---

# Persistence and Prisma

## Boundaries

- Application contracts live under `src/application/runtime/execution/types.ts`
  and related port files.
- `src/infrastructure/prisma/prisma-runtime-store.ts` implements runtime
  persistence; repository classes implement domain/application storage ports.
- `src/infrastructure/prisma/mappers/` translates Prisma rows and JSON into
  domain/application values. Do not leak Prisma types inward.
- `src/infrastructure/composition/index.ts` owns Prisma construction and
  dependency wiring.
- Application persistence uses typed Prisma operations. Raw SQL is confined to
  migration/reset/bootstrap boundaries; the architecture test
  `src/tests/architecture/prisma-persistence-boundary.test.ts` enforces this.

## Safety rules

- Never point Prisma shadow, migration, reset, or integration operations at a
  real database.
- Use `MINDER_TEST_DATABASE_URL` for phase-4 integration tests and a throwaway
  service only.
- `prisma generate` still needs `DATABASE_URL`; use a safe placeholder URL.
- Keep schema ownership explicit. Inspect `database-config.ts`, `schema.prisma`,
  migration SQL, and `schema/migrate.ts` before changing table behavior.
- Use transaction helpers in `transactions.ts`; do not scatter isolation or
  retry behavior across repositories.
- Preserve owner keys, run/session relationships, event sequence ordering, and
  recovery evidence when changing runtime persistence.

## Change procedure

1. Start from the application operation in
   `src/application/runtime/execution/types.ts` (or the relevant repository
   port). Search every caller and implementation before changing its shape.
2. Read `src/infrastructure/prisma/schema.prisma`, the baseline migration,
   `schema/migrate.ts`, and `database-config.ts` when changing tables or schema
   selection. The Prisma schema lives under `src/infrastructure/prisma/`, not
   at a repository-root `prisma/` directory.
3. Keep database reads/writes in the adapter or repository. Map returned rows
   in `mappers/` and preserve the application's types. Use
   `transactions.ts` for existing retry/isolation behavior.
4. Verify the in-memory contract and Prisma mapping with focused tests. Use a
   throwaway PostgreSQL service only when SQL constraints, migrations,
   concurrency, or recovery behavior need an integration check.

Example: adding run evidence requires the application-facing store method,
the Prisma implementation and mapper, and a test that the same owner can read
the evidence after a new manager instance. A passing insert alone does not
verify recovery or isolation.

## Test pattern

Unit tests use typed Prisma doubles and assert exact schema, transaction, and
mapping behavior. Integration tests must be clearly marked and use the
throwaway database. `src/tests/infrastructure/prisma-pg/runtime/` contains
the database-backed tests; set `MINDER_TEST_DATABASE_URL` only to the Compose
test service described in the root `README.md`. Run focused persistence tests
before:

```bash
npm run test:phase-4
npm run test:architecture
npm run check
```

Never use `git reset --hard` or destructive database cleanup to make a test
pass.
