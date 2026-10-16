---
name: git-delivery
description: Use when committing, branching, opening a pull request, or preparing a deployable build of celesnity-web
---

# Git Delivery

## Overview

Nothing is committed or pushed unless the user asks. When they do, the gate runs
first and the commit message says what changed at the architectural level.

## Gate (all must pass, in this order)

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:visual   # required for any change that can move pixels
git diff --check      # no whitespace errors / conflict markers
```

Committing an updated screenshot baseline is a deliberate act: say in the commit
body which screens changed and why.

If a step fails, stop and fix it. Never report "done" from a partial run, and
never quote a result you did not see.

## Commit

- Never commit directly to `main` for feature work: branch first
  (`feat/<slug>`, `fix/<slug>`, `refactor/<slug>`).
- One logical change per commit. Structural moves separate from behavior changes.
- Message style follows this repo's history — a lowercase type prefix and an
  imperative summary:

  ```text
  feat: add connection archive flow
  fix: preserve execution terminal finalization
  refactor: enforce clean architecture boundaries
  ```

- Body (when the change is not obvious): what changed per layer, why, and which
  contract or test proves it.
- Stage deliberately: `git status` then `git add <paths>`. Never `git add -A`
  without reading the list — `.env`, `.next/`, `.worktrees/`, and `.idea/` must
  never enter a commit.
- Generated `schema.d.ts` changes belong in their own commit with the note that
  `npm run api:generate` produced them.

## Pull request

- Title: same style as the commit summary.
- Body: what changed, which layers, how it was verified (the gate output), what
  is intentionally out of scope, and any follow-up needed.
- Call out anything reviewers must judge: a changed test contract, a new
  dependency, a structural convention.
- `gh pr create` for the PR; do not push to someone else's branch.

## Build and deploy artifacts

- `npm run build` produces the standalone server plus copied assets via
  `scripts/prepare-standalone-assets.mjs`; `npm start` runs
  `.next/standalone/server.js`.
- `tests/unit/tooling/standalone-output.test.ts` guards that output — if you touch
  the build script or `next.config.ts`, run it.
- Container and cluster manifests: `Dockerfile`, `cloudbuild.yaml`, `k8s/base`,
  `k8s/overlays`. Changing runtime configuration means changing the manifest and
  `.env.example`, not only local `.env`.
- Environment: `NEXT_PUBLIC_CORE_API_URL` is the only public variable today; add
  new ones to `.env.example` and to
  `src/infrastructure/configuration/public-environment.ts` with a default.

## Rules

- No force-push to a shared branch. No amending a pushed commit others may have.
- No secrets in commits, tests, logs, or PR text.
- Do not merge your own PR unless the user says to.
