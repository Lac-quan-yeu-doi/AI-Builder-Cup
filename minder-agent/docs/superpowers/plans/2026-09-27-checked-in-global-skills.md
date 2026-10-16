# Checked-In Global Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load committed `.agents/skills/<name>/` packages as immutable global skills for every eligible Agent owner and make their resources readable inside the sandbox.

**Architecture:** A synchronous infrastructure loader reads and validates repository skill folders once when the existing skill service is composed. The existing `ListSkills` and `InvokeSkill` flow stays in place; invocation includes a fixed sandbox resource directory for checked-in skills. Both Agent and sandbox images package the same folder tree, and existing sandbox read/write rules keep it read-only.

**Tech Stack:** Node.js 22, TypeScript, NestJS, existing `yaml` dependency, Node test runner, Docker Compose, Cloud Build.

**Spec:** `docs/superpowers/specs/2026-09-27-checked-in-global-skills-design.md`

## Global Constraints

- The source of truth is `minder-agent/.agents/skills/`; every immediate child package has a `SKILL.md`.
- Required frontmatter is `name` and non-empty `description`; optional `namespace` defaults to `""`; `name` must match the directory and existing lowercase kebab-case rule.
- Reject malformed frontmatter, duplicate names, directory/name mismatches, and symlinks; report the package-relative path and reason.
- Preserve global-over-project precedence, owner-scoped project skills, existing per-agent allowlists, and read-only global behavior.
- Do not add a skill HTTP API, database schema, package manager, tool name, or second invocation tool.
- Sandbox resources live at `/usr/share/minder/skills/<name>/`; derive the path from the validated skill name, never caller input.
- Keep `/usr/share/minder` in sandbox `allowRead`; keep it out of `allowWrite`; do not copy resources into tenant workspaces.
- Skills remain trusted, reviewed repository content; sandbox networking stays disabled.
- Preserve all existing working-tree changes; do not commit, push, open a PR, or deploy without explicit user instruction.

---

## File Map

- Create `.agents/skills/pdf-report/SKILL.md` and `.agents/skills/typst/SKILL.md`: move the current global instruction bodies without edits.
- Create `.agents/skills/humanizer/SKILL.md` (and any companion files supplied with the local skill): install the user-provided example package in the checked-in format.
- Create `src/infrastructure/skill/repository-skill-loader.ts`: discover immediate skill directories, parse frontmatter with the already-installed `yaml` package, validate package shape and reject symlinks, return `GlobalSkillInput[]`.
- Create `src/tests/infrastructure/skill/repository-skill-loader.test.ts`: focused loader validation and discovery coverage using temporary directories.
- Modify `src/infrastructure/composition/tools.ts`: load the repository catalog once and use it in the existing owner-scoped `SkillService` composition; attach the fixed sandbox path in the existing optional tool resolver.
- Modify `src/infrastructure/tools/impl/skill-tools.ts` and `src/tests/infrastructure/tools/impl/advanced-tools.test.ts`: include the optional resource path in the existing `InvokeSkill` response while keeping one tool.
- Modify `src/application/shared/ports/integrations/tools.ts`, `src/infrastructure/tools/core/types.ts`, `src/infrastructure/tools/impl/executable-tool.ts`, `src/infrastructure/tools/impl/runtime-registry.ts`, and `src/infrastructure/tools/core/registry.ts`: preserve configured per-tool output limits through the runtime registry.
- Modify `src/tests/infrastructure/tools/core/registry.test.ts`: verify a configured tool output limit reaches runtime results.
- Modify `src/tests/infrastructure/composition/tools.test.ts` and relevant skill-service tests: verify global visibility/read-only behavior, precedence, allowlists, and same catalog across owners.
- Modify `minder-agent/Dockerfile`: copy `.agents/skills/` into the Agent image.
- Modify `minder-agent/sandbox-runner/Dockerfile`, root `docker-compose.yaml`, `minder-agent/cloudbuild.yaml`, and `minder-agent/cloudbuild.verify-phase-0.yaml`: package the same skills into the runner image using the Agent repo as build context.
- Verify the running sandbox runner's Unix socket with a read, denied write, unchanged-hash, and workspace-write smoke command.
- Modify `minder-agent/README.md`: document package layout, frontmatter, installation by copying a standard folder, immutability, and allowlist behavior.

## Task 1: Load checked-in skill packages as global catalog entries

**Files:**
- Create: `minder-agent/src/infrastructure/skill/repository-skill-loader.ts`
- Create: `minder-agent/src/tests/infrastructure/skill/repository-skill-loader.test.ts`
- Create: `minder-agent/.agents/skills/pdf-report/SKILL.md`
- Create: `minder-agent/.agents/skills/typst/SKILL.md`
- Create: `minder-agent/.agents/skills/humanizer/SKILL.md` and supplied companion files, if any
- Modify: `minder-agent/src/infrastructure/composition/tools.ts`
- Delete after migration: `minder-agent/src/infrastructure/composition/report-skills.ts`
- Delete after migration: `minder-agent/src/infrastructure/composition/typst-skill.ts`
- Modify: `minder-agent/src/tests/infrastructure/composition/tools.test.ts`

**Interfaces:**
- Produces `loadRepositorySkills(root: string): readonly GlobalSkillInput[]`, which throws a descriptive error if the required root or any package is invalid.
- The loader output matches existing `GlobalSkillInput`: `{ name, description, namespace, body }`.
- `createSkillServiceForOwner(skillStore)` keeps its current call signature and feeds the loaded catalog to the existing `createSkillService`.

- [x] **Step 1: Add loader tests for valid folder discovery and frontmatter.** Use `mkdtemp`/`mkdir`/`writeFile` fixtures; cover a valid package with `name`, `description`, optional `namespace`, body extraction, and a package with omitted `namespace` yielding `""`. Also cover sibling directories and nested resources. A fixture's `SKILL.md` should look like:

```md
---
name: humanizer
description: Remove signs of AI-generated writing.
namespace: writing
---
Follow the skill instructions.
```
- [x] **Step 2: Add loader rejection tests.** Cover missing root, missing `SKILL.md`, empty body, invalid YAML/frontmatter, missing description, invalid skill name, directory/name mismatch, and symlinks. Assert errors identify the package-relative path and failure. Duplicate-name defense is implemented; requiring the directory to match `name` makes duplicate names unreachable on the supported filesystem.
- [x] **Step 3: Run the loader test file and confirm it fails because the loader is not implemented.**

Run from `minder-agent/`: `npm test -- src/tests/infrastructure/skill/repository-skill-loader.test.ts`.

Expected: the new test cannot import `loadRepositorySkills` yet.
- [x] **Step 4: Implement the loader with Node filesystem APIs and the existing `yaml` dependency.** Resolve each immediate child, recursively reject symlinks with `lstat`, parse the frontmatter delimiter and YAML mapping, validate name/description/namespace/body, reject duplicates, and return stable name-sorted `GlobalSkillInput` entries. Do not add a dependency.
- [x] **Step 5: Move the existing PDF-report and Typst instructions byte-for-byte into their skill folders.** Copy the supplied Humanizer skill folder into `.agents/skills/humanizer/`; preserve its `SKILL.md` and companion resources as provided.
- [x] **Step 6: Replace hard-coded constants with the repository loader in `createSkillServiceForOwner`.** Load the immutable catalog once at composition time; keep the per-owner `SkillService` cache and owner-specific `SkillPort` instances.
- [x] **Step 7: Update composition tests.** Verify two owners see the same global names, global skills are read-only, and allowlists still filter globals. Existing skill-service tests cover global precedence. Verify the moved report/Typst instructions through their existing behavior tests.
- [x] **Step 8: Run the loader, skill-service, and composition tests.**

Run from `minder-agent/`: `npm test -- src/tests/infrastructure/skill/repository-skill-loader.test.ts src/tests/infrastructure/composition/tools.test.ts src/tests/application/skill/skill-service.test.ts`.

Expected: all focused tests pass; no DB/API or tool-name changes.

## Task 2: Return the fixed sandbox resource location through existing InvokeSkill

**Files:**
- Modify: `minder-agent/src/infrastructure/composition/tools.ts`
- Modify: `minder-agent/src/infrastructure/tools/impl/skill-tools.ts`
- Modify: `minder-agent/src/tests/infrastructure/composition/tools.test.ts`
- Modify: `minder-agent/src/tests/infrastructure/tools/impl/advanced-tools.test.ts`

**Interfaces:**
- Extend the existing `SkillInvoker.invoke` result to `{ body: string; resourcePath?: string }`.
- For a checked-in global skill, composition returns `resourcePath: "/usr/share/minder/skills/<validated-name>/"`; project skills omit it.
- Keep the `InvokeSkill` input as `{ name: string }` and preserve the existing tool and access policy.

- [x] **Step 1: Add failing tests for invocation output.** A global skill response must contain its instructions and fixed resource path; a project skill response must contain its instructions without a path; a disallowed name must continue to return the existing stable failure. Assert the resolved global invocation is equivalent to `{ body: "Follow the skill instructions.", resourcePath: "/usr/share/minder/skills/humanizer/" }`.
- [x] **Step 2: Run only the InvokeSkill/composition tests and confirm the global-path assertion fails.** Run `npm test -- src/tests/infrastructure/tools/impl/advanced-tools.test.ts src/tests/infrastructure/composition/tools.test.ts` from `minder-agent/`.
- [x] **Step 3: Extend the existing invoker result and resolver.** Derive the path from `skill.source === "global"` and the already validated `skill.name`; do not accept path input from the model.
- [x] **Step 4: Include the resource path in the existing `InvokeSkill` content and metadata.** Place it before the skill body and carry its 40,000-character output limit through the runtime registry so both the path and 29,632-byte Humanizer instructions arrive intact.
- [x] **Step 5: Re-run `npm test -- src/tests/infrastructure/tools/impl/advanced-tools.test.ts src/tests/infrastructure/composition/tools.test.ts` from `minder-agent/`.** Confirm project invocations do not get the global path and no new tool is registered.

## Task 3: Package repository skills read-only in both runtime images

**Files:**
- Modify: `minder-agent/Dockerfile`
- Modify: `minder-agent/sandbox-runner/Dockerfile`
- Modify: `docker-compose.yaml`
- Modify: `minder-agent/cloudbuild.yaml`
- Modify: `minder-agent/cloudbuild.verify-phase-0.yaml`
- Verify: running sandbox runner socket accepts reads from the package and denies writes

**Interfaces:**
- Agent runtime expects the source tree at its application root as `.agents/skills/`.
- Sandbox image exposes the same checked-in folders under `/usr/share/minder/skills/`.
- Compose and both Cloud Build runner invocations use build context `minder-agent/` and Dockerfile `sandbox-runner/Dockerfile`.

- [x] **Step 1: Verify the sandbox boundary through the runner Unix socket.** Read the packaged Humanizer `SKILL.md`, attempt to append to it, confirm its hash is unchanged, then write a file in the active workspace.
- [x] **Step 2: Run `npm test` from `minder-agent/sandbox-runner/`.** The existing four renderer tests pass; the real sandbox filesystem boundary was exercised through the runner socket after rebuild.
- [x] **Step 3: Copy `.agents/skills/` into the Agent runtime image.** Keep the loader's expected application-root path unchanged and validate the catalog during the image build.
- [x] **Step 4: Change the runner build context to `minder-agent/`.** Update its Dockerfile source paths to `sandbox-runner/package.json`, `sandbox-runner/package-lock.json`, `sandbox-runner/server.mjs`, and `sandbox-runner/typst-wrapper.mjs`; copy `.agents/skills/` to `/usr/share/minder/skills/` and preserve the existing report template path.
- [x] **Step 5: Update root Compose and both Cloud Build runner commands to use the same context/Dockerfile pair.** Do not change runtime image contexts or runner network/sandbox policy.
- [x] **Step 6: Verify the sandbox image contains the checked-in Humanizer package and both existing skills.** Agent and runner images both contain `humanizer`, `pdf-report`, and `typst`.

## Task 4: Document folder installation and verify Compose end-to-end

**Files:**
- Modify: `minder-agent/README.md`
- No additional product/API files unless a focused check reveals a concrete gap in Tasks 1–3.

- [x] **Step 1: Document the checked-in install workflow.** Include `.agents/skills/<name>/SKILL.md`, required `name`/`description`, optional `namespace`, copying a Codex/Claude-compatible folder, global read-only behavior, and existing per-agent allowlist gating.
- [x] **Step 2: Run loader, composition, tool, and sandbox tests once as a focused batch.** From `minder-agent/`, run the loader, composition, skill-tool, and skill-service Vitest files; from `minder-agent/sandbox-runner/`, run `npm test`.
- [x] **Step 3: Run the Agent TypeScript check and lint commands from `minder-agent/`: `npm run check` and `npm run lint`.**
- [x] **Step 4: Build the runtime and runner images from the Agent repository context.** Confirm both images contain the same three package names.
- [x] **Step 5: Rebuild the local Compose runtime and sandbox runner and inspect the full service state.** Run `rtk docker compose up -d --build --wait minder-runtime minder-sandbox-runner` from the project root, then `rtk docker compose ps -a`; both migration jobs completed with exit code 0.
- [x] **Step 6: Report the modified repositories/files, exact checks and outcomes, and any pre-existing unrelated failures.** Do not commit or push.

## Self-Review

- Spec coverage: loader, checked-in skill migration, Humanizer example package, existing tool invocation path, immutable global catalog, allowlists, owner isolation, sandbox resource packaging, read-only access, Compose/Cloud Build contexts, install documentation, focused checks, image builds, and local Compose health are all assigned above.
- No new API, database field, install command, invocation tool, or caller-provided filesystem path is introduced.
- Interface consistency: loader output is `GlobalSkillInput[]`; the existing resolver and `SkillInvoker` pass an optional `resourcePath`; path is generated only for global skills from the validated name.
- Existing pending modifications listed in the task context remain out of scope and must be preserved.
