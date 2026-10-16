# minder-agent

- Native TypeScript runtime with CLI and caller-scoped HTTP/SSE entry points; PostgreSQL durability is optional.
- Read `mem:repo_guides` for the `AGENTS.md` workflow, skill routing, architecture rules, and Git boundaries.
- Use `.ua/knowledge-graph.json` to locate likely files, callers, and layers: `nodes` and `edges` map code entities and relationships, `layers` groups architecture areas, and `tour` provides entry points.
- Before trusting `.ua`, compare `.ua/meta.json`'s `gitCommitHash` with `git rev-parse HEAD`. The graph describes an analyzed commit and may miss working-tree edits; when stale, use it only for navigation. Always verify findings in current source and tests. `.ua` is ignored local index data, not source of truth.
- Dependency direction: `domain` is pure; `application` depends on domain and ports; `infrastructure` implements ports; `presentation` adapts CLI/HTTP; `modules` and `bootstrap` compose dependencies.
- Preserve owner authorization before owner-scoped reads, writes, replay, and event streams; keep workspace paths confined and MCP scopes checked.
- Preserve run admission/status, journal ordering, event IDs and replay cursors, terminal events, pause/resume and approval state, and tool-call IDs. Persist lifecycle/terminal events before publishing them.
- Read `mem:tech_stack` for runtime/build tooling, `mem:conventions` for TypeScript and layer rules, `mem:suggested_commands` for common commands, and `mem:task_completion` for verification and test safety.