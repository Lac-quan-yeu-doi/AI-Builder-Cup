---
name: security-and-isolation
description: Use when changing authentication, tenant or owner isolation, workspace paths, MCP data scopes, secrets, or security-sensitive tool behavior
---

# Security and Isolation

## Trust boundaries

- HTTP caller identity is resolved by `src/presentation/http/guards/authentication.ts`
  and infrastructure assertion authentication. Never trust an owner or room ID
  supplied by an unauthenticated request.
- `src/infrastructure/auth/` creates authenticated principals and handles
  assertion replay protection.
- Runtime and room reads/mutations must authorize the owner before accessing
  state or emitting events.
- Workspace paths go through `src/infrastructure/workspace/paths/safe-path.ts`
  and must remain inside the resolved tenant/room workspace.
- MCP arguments are checked by `src/infrastructure/mcp/protocol/data-scope.ts`
  before reaching a data server.

## Rules

- Deny by default when identity, scope, manifest ownership, or path confinement
  is missing or ambiguous.
- Keep secrets out of logs, previews, approval evidence, error responses, and
  persisted model context. Hash arguments when approval identity is needed.
- Preserve constant-time comparisons for secrets and signatures.
- Do not broaden an allowlist or data scope as a convenience fix.
- Test cross-owner access, traversal paths, malformed assertions, replayed
  assertions, out-of-scope SQL/catalog/schema, and redaction behavior.

## Change procedure

1. Locate where the principal is created, where the resource owner is loaded,
   and where the requested operation runs. Search every route and caller that
   reaches the shared method. Authorization must happen before returning
   content, metadata, events, or a replay cursor.
2. For HTTP, follow `guards/authentication.ts` and
   `common/auth/owner-auth.guard.ts` into the application call. Preserve the
   endpoint's established `403` or hidden `404` behavior for another owner.
3. For workspace changes, pass paths through `paths/safe-path.ts` after the
   tenant/room workspace is resolved; inspect local and S3 adapters for the
   same confinement. For MCP changes, inspect `protocol/data-scope.ts` before
   a tool reaches the server.
4. Add one focused adversarial test next to the closest existing test: a
   second owner, `../` path, replayed assertion, out-of-scope target, or
   secret-bearing output, whichever boundary changed.

Example: adding a run evidence read requires owner authorization before both
the JSON response and any file-content lookup. A caller-supplied `runId`
selects a candidate resource; it does not establish ownership.

## Verification

Read callers and the closest security tests before editing. Run the focused
security test first, then broader checks proportionate to the change:

```bash
npm run test:architecture
npm run check
npm run lint
```

Do not add a bypass, debug flag, or fallback authentication mode without an
explicit user requirement and a bounded test.
