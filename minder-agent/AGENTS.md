# Coding-agent guide — minder-agent

`minder-agent` is a strict TypeScript runtime. It exposes CLI and caller-scoped HTTP/SSE runs, with optional PostgreSQL durability. Preserve existing public contracts while making the smallest change that fulfills the task.

## Start every task here

1. Read [README.md](README.md), then select and read every matching guide in [skills/](skills/README.md) before editing.
2. Use [`.ua/knowledge-graph.json`](.ua/knowledge-graph.json) to locate likely files, callers, and layers. It is an index, not source of truth: compare `.ua/meta.json`'s analyzed commit with `git rev-parse HEAD`, then verify conclusions in current source and tests.
3. Trace the complete vertical slice: HTTP or CLI boundary → application contract → adapter/store → event or response. Search callers with `rg` before changing an exported contract.
4. Preserve unrelated working-tree changes. Do not commit, push, open a PR, create a branch, tag, merge, or deploy unless the user explicitly asks.

## Architecture and safety rules

- Dependencies point inward: `domain` is pure; `application` depends on domain and ports; `infrastructure` implements ports; `presentation` adapts HTTP/SSE/CLI; `modules` and `bootstrap` compose concrete dependencies.
- Keep Nest, Prisma, filesystem, network, environment, and provider details outside domain and application orchestration. Add a narrow port when application behavior needs an external capability.
- Preserve owner isolation before every owner-scoped read, mutation, replay, or event stream. Keep workspace paths confined and MCP data scopes checked.
- A run is admitted before it completes. Preserve run status, journal ordering, event IDs, replay cursors, terminal events, pause/resume state, approval state, and tool-call IDs.
- Use controlled Nest configuration and throwaway databases in tests. Never let tests read a developer `.env` or operate on a real database.

## Conventions

- Read [naming-conventions](skills/naming-conventions/SKILL.md) for names, paths, API fields, and test files.
- Read [coding-conventions](skills/coding-conventions/SKILL.md) for TypeScript, Nest, errors, validation, and verification rules.
- Follow the closest existing vertical slice. Existing runtime contracts and architecture tests decide ambiguities.
- Run the narrowest relevant check first. The suite is large; do not repeatedly run broad suites. Use the full quality gate only when the task, risk, or user request warrants it, and report unrelated baseline failures separately.

## Git delivery

Read [skills/git-delivery/SKILL.md](skills/git-delivery/SKILL.md) for every Git action. Celesnity delivery also follows these rules:

- `main` is the source of truth; do not push directly to `main`, `release/*`, or `development`.
- Start `release/<version>` from `main`; start `feat/<name>` from that release branch.
- Feature delivery uses separate PRs to `development` and the current `release/<version>`; promotion goes from `release/<version>` to `main` after approved deployment.
- Put `v<version>` tags only on the selected release commit after approval. Never infer approval to push, merge, tag, or deploy.

Before any Git or hosting action, inspect the repository root, branch, status, remotes, and relevant refs. Preserve uncommitted work and stop when the requested action conflicts with the observed branch or release state.

## Changelog and user guide (cross-repo rule)

The product's changelog and user guide live in `celesnity-web`, because that is
where people read them: `celesnity-web/data/changelogs/<YYYY-MM>.json` and
`celesnity-web/docs/user-guide/{vi,en}/*.md`. A change here that a user can
notice — how the assistant answers, what it can do, what it asks permission
for, a new tool, a changed limit — is not done until an entry (`areas: ["agent"]`,
both `vi` and `en`, written for the user) is added there and the relevant guide
page (usually `10-chat.md` or `11-charts-in-chat.md`) still describes the
behaviour correctly. Read and follow
[skills/changelog-and-user-guide/SKILL.md](skills/changelog-and-user-guide/SKILL.md),
also whenever the user mentions `$changelog`, a changelog, release notes or the
user guide. The entry is credited to the developer you are working for,
resolved from `git config user.email` through
`celesnity-web/data/changelogs/authors.json`, never to an AI assistant.
Refactors, tests, tooling and internal renames are exempt.
