# Checked-in global skills design

## Status

Design approved in conversation on 2026-09-27. This document records the approved scope and architecture; it is not an implementation plan.

## Problem

Minder Agent's global skills are currently defined as TypeScript constants in `src/infrastructure/composition/report-skills.ts` and `typst-skill.ts`. Owner-created skills are stored in the database. A skill invocation returns its Markdown body to the model, but the isolated sandbox cannot read skill folders or their companion resources.

This makes adding a shared skill require a code edit and leaves scripts or reference files beside a skill unavailable to sandbox commands. The user wants to install a standard skill folder into the repository, commit it, and make it available to every Agent owner.

## Goals

- Store shared skills as committed folders under `.agents/skills/<skill-name>/`.
- Accept the standard `SKILL.md` frontmatter shape with required `name` and `description`, plus optional fields such as `license` and `metadata`.
- Load checked-in skills as immutable global skills for every owner through the existing skill catalog and invocation tools.
- Make the complete skill folder available read-only to sandboxed commands, including `scripts/`, `references/`, and `assets/` when present.
- Preserve existing global-over-project name precedence, per-agent skill allowlists, and owner-scoped database skills.
- Move the existing `pdf-report` and `typst` global skill content into the folder format without changing their instructions.

## Non-goals

- Add an HTTP API or database schema for installing global skills.
- Allow an owner or sandbox command to mutate checked-in global skills.
- Broaden per-agent skill allowlists automatically.
- Add a custom package manager or copy command. Installation is copying a standard skill folder into `.agents/skills/` and committing it.
- Change tool names or add a second skill invocation tool.

## Repository format and discovery

The source of truth is `minder-agent/.agents/skills/`. The directory is required and each immediate child directory is one skill package that must contain `SKILL.md`:

```text
.agents/skills/
  humanizer/
    SKILL.md
    references/
    scripts/
  pdf-report/
    SKILL.md
  typst/
    SKILL.md
```

An infrastructure loader reads this directory once during composition. It parses YAML frontmatter using the existing YAML dependency, validates that the skill name matches the directory name and the existing lowercase kebab-case rule, requires a non-empty description and instruction body, and rejects malformed frontmatter, duplicate names, and symlinks. `namespace` may be supplied as optional frontmatter; when omitted it is empty. Other frontmatter fields are retained in the committed source but do not change current catalog behavior.

The loader constructs global skill definitions using the existing skill service. Existing database-backed project skills remain owner-scoped. A checked-in global skill with a matching project skill name continues to win, and the global skill remains read-only through the existing API.

The default chat assistant's existing wildcard allowlist makes the catalog available to all owners. Other agent definitions continue to use their existing allowlists. Installing a global skill does not silently change which skills a particular agent may invoke.

## Runtime and sandbox flow

The Agent runtime image includes `.agents/skills/` at its application root and loads the `SKILL.md` instructions into the global catalog. The sandbox runner image receives the same committed directory at `/usr/share/minder/skills/`.

The sandbox already allows reads from `/usr/share/minder` and does not allow writes there. Keep that read-only boundary. Do not copy skill resources into a tenant workspace or accept a filesystem path from the skill caller.

`ListSkills` continues to return the allowed skill summaries. `InvokeSkill` returns the skill's Markdown body and, for a checked-in global skill, the fixed sandbox path `/usr/share/minder/skills/<name>/`. The model can then read a reference file or execute a script using that path through the existing sandbox `Bash` tool. The path is derived from the validated skill name, never from tool arguments.

To give both images the same source files, update the sandbox runner's Compose and Cloud Build invocations to use `minder-agent/` as the build context with `sandbox-runner/Dockerfile` as the Dockerfile. Adjust Dockerfile `COPY` paths accordingly. The verification build must use the same context so the package is tested before deployment.

## Installation and maintenance

To install a skill from a local Codex or Claude-compatible skill directory:

```bash
mkdir -p .agents/skills
cp -R /path/to/skill .agents/skills/<skill-name>
```

Check that the copied directory name matches `name` in `SKILL.md`, then commit the folder. Every rebuild packages it for all Agent owners. The repository README will document the layout, accepted frontmatter, install procedure, global immutability, and that per-agent allowlists still apply.

The current `pdf-report` and `typst` skill constants move to `.agents/skills/pdf-report/SKILL.md` and `.agents/skills/typst/SKILL.md`. Remove the TypeScript constants after preserving their instruction text. This keeps the checked-in folder as the sole source of global skill bodies.

## Errors and security

- Missing `.agents/skills/` is a startup/build error because the checked-in `pdf-report` and `typst` skills are required global packages.
- A malformed or ambiguous package is a startup/build error with its relative path and reason. Do not silently skip invalid skills.
- Reject symlinks during both image-build validation and runtime loading so a skill package cannot escape the committed directory or expose runner files through `/usr/share/minder/`.
- Skills are trusted, reviewed repository content. Their sandbox resources are readable but not writable, and sandbox networking remains disabled.
- Existing owner authentication, owner-scoped skill persistence, manifest allowlists, tool approval policy, and path confinement remain unchanged.

## Verification

- Unit-test frontmatter parsing, body extraction, valid package discovery, optional namespace, name/directory mismatch, malformed metadata, duplicate names, and symlink rejection.
- Verify the composition exposes checked-in skills as global/read-only to multiple owners, preserves global-over-project precedence, and still respects per-agent allowlists.
- Verify `InvokeSkill` returns instructions and the expected fixed sandbox resource path without accepting a caller-provided path.
- Verify sandbox commands can read an installed skill resource and cannot write to `/usr/share/minder/skills/`.
- Run focused skill/composition/sandbox tests, TypeScript check, lint, and the repository's runtime and sandbox image verification builds.
- Rebuild the local Compose runtime and sandbox runner, then confirm both packages contain the same installed skill and both services are healthy.

## Acceptance criteria

1. Copying a valid skill folder into `.agents/skills/<name>/` and rebuilding makes it appear in `ListSkills` for every owner whose agent allowlist permits it.
2. `InvokeSkill` returns the exact `SKILL.md` instructions and identifies its sandbox resource directory.
3. A sandbox command can read a package reference or script from that directory, while writes fail.
4. The bundled `pdf-report` and `typst` skills remain available with unchanged instruction content.
5. Invalid folders fail validation, and a project skill cannot shadow a checked-in global skill.
6. Existing owner-scoped project skill CRUD, global read-only behavior, and per-agent allowlists continue to work.
