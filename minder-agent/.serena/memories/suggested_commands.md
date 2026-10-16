# Common commands

- Install pinned dependencies: `npm install --ignore-scripts`.
- Start HTTP host: `npm run dev`; health check: `curl --fail http://127.0.0.1:8080/api/v1/healthz`.
- CLI: set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`, then run `npm run cli -- "<task>"`; use `npm run cli -- --chat` for interactive chat.
- Focused tests: `npm test -- <path-to-test.test.ts>`; architecture checks: `npm run test:architecture`; phase projects: `npm run test:phase-0` through `npm run test:phase-4` and `npm run test:compat`.
- Static/build checks: `npm run check`, `npm run lint`, `npm run build`.
- Phase-4 database tests use only the throwaway PostgreSQL service from `docker-compose.test.yml` and `MINDER_TEST_DATABASE_URL`. Never point test/reset commands at a developer or production database. The destructive reset requires `MINDER_RESET_CONFIRM=DROP_MINDER_RUST_DATA` and an explicitly throwaway target.