# minder-agent — Claude Code instructions

@AGENTS.md

`AGENTS.md` above is the full guide; the working procedures are in `skills/`
and `skills/README.md` lists them. Two triggers to keep in mind:

- When the user mentions `$changelog`, a changelog, release notes, the user
  guide, or when you have just finished any change a person using the
  assistant can notice, read and follow
  `skills/changelog-and-user-guide/SKILL.md`. The entry is attributed to the
  developer you are working for, resolved from `git config user.email`, never
  to an AI assistant.
- Before any Git action, read and follow `skills/git-delivery/SKILL.md`. Never
  commit, push, branch, tag, merge or deploy unless the user asks.
