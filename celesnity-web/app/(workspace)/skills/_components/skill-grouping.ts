import type { SkillSource, SkillSummary } from '@/src/entities/models/skill';

/**
 * How the library is filtered and grouped.
 *
 * One level: `source`. It was a badge repeated on every row and it is now the
 * heading, which is where both references put it — Claude's skills page splits
 * into Personal / Shared with you / Organization, ChatGPT's plugin directory
 * tabs by OpenAI / workspace / Personal.
 *
 * `namespace` deliberately does **not** group. It is a free-text label with no
 * consumer in the agent, and splitting a handful of skills across two or three
 * of them costs more headings than it saves scanning. It stays on the form and
 * stays searchable.
 */

/** Below this, a filter costs more than it saves — you can see the whole list. */
export const SKILL_SEARCH_THRESHOLD = 8;

/** Project before global: it is the half you can actually edit. */
export const SKILL_SOURCE_ORDER: readonly SkillSource[] = ['project', 'global'];

export interface SkillSourceGroup {
  readonly source: SkillSource;
  readonly count: number;
  readonly skills: readonly SkillSummary[];
}

export function matchesSkillQuery(skill: SkillSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return (
    skill.name.toLowerCase().includes(needle) ||
    skill.description.toLowerCase().includes(needle) ||
    skill.namespace.toLowerCase().includes(needle)
  );
}

/**
 * Filter, then group by source.
 *
 * A source with no matches is dropped rather than rendered as an empty heading,
 * so searching does not leave two labels standing over nothing.
 */
export function groupSkills(
  skills: readonly SkillSummary[],
  query = '',
): readonly SkillSourceGroup[] {
  const matched = skills.filter((skill) => matchesSkillQuery(skill, query));

  return SKILL_SOURCE_ORDER.map((source) => {
    const inSource = [...matched.filter((skill) => skill.source === source)].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    return { source, count: inSource.length, skills: inSource as readonly SkillSummary[] };
  }).filter((group) => group.count > 0);
}

/**
 * A skill the agent cannot route to.
 *
 * `build_index()` in `minder-skills` emits `- **{name}** — {description}` and
 * nothing else; with an empty description the agent is left guessing from the
 * name. That is a defect in the skill, so the row says so rather than rendering
 * a blank second line.
 */
export function isUnroutable(skill: SkillSummary): boolean {
  return skill.description.trim().length === 0;
}
