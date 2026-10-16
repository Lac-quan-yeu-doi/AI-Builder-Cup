---
name: project-skill-management
description: Use when listing, inspecting, creating, updating, or deleting reusable project skills through Celesnity Core skill tools.
namespace: skills
---

# Project skill management

Core's skill MCP tools manage owner-scoped project skills. They do not install or edit checked-in global skill folders under `.agents/skills/`. Project skills are writable through these tools; global skills are read-only.

## Inspect and edit

- Call `list_skills({})` first to see exact names, sources, and existing style before creating a skill.
- Call `get_skill({name})` to read a skill in full before editing it.
- `create_skill({name, description, body, namespace?})` creates a project skill. Names are permanent lowercase letters, digits, and hyphens, beginning with a letter or digit. `description` and `namespace` must each be a single line; put Markdown instructions in `body`.
- `update_skill({name, description, body, namespace?})` replaces the existing project's description, namespace, and full body. Read first and preserve content outside the requested edit. The name cannot change.
- `delete_skill({name})` permanently deletes a project skill. Confirm the exact name and user intent before calling it.

Only project skills can be created, updated, or deleted with these tools. Attempting to modify a global skill fails. To add a shared global skill, follow the repository's checked-in `.agents/skills/<name>/SKILL.md` convention instead of calling `create_skill`.

## Few-shot patterns

**Create:** list skills, confirm the name is unused, then create only after the user asks for the reusable skill:

```json
{"name":"weekly-review","description":"Summarize the team's weekly outcomes.","namespace":"reports","body":"# Weekly review\n\nUse verified source data and cite the saved report."}
```

**Update:** call `get_skill` with the exact name, preserve unrelated instructions, then send the complete replacement `body` with the new single-line description and namespace.

**Global skill request:** list/get can inspect a global skill, but do not try update/delete. Explain that global skill changes belong in the checked-in repository folder.

