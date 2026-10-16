# Code conventions

- Use ESM imports with local `.js` specifiers and `import type` for type-only imports. Keep contracts readonly; model finite states with discriminated unions/string unions. Respect `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- Keep Nest, Prisma, filesystem, network, environment, and provider details out of domain/application orchestration. Application uses narrow ports; infrastructure owns concrete adapters; presentation maps boundary input and stable HTTP/SSE output.
- Validate untrusted input at the boundary, authorize owners before scoped operations, and preserve public error/event/response shapes. Keep async rejection behavior and ordered durable lifecycle events intact.
- Files/directories use lowercase kebab case; classes/types PascalCase; functions/fields camelCase; constants, tokens, and environment variables UPPER_SNAKE_CASE. Public HTTP JSON fields follow established snake_case conventions.
- Tests live under `src/tests/<layer>/` and use `<behavior>.test.ts`. Follow the closest vertical slice; avoid speculative abstractions and mutable global state.