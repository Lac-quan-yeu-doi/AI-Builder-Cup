'use client';

import { MoreHorizontalIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';

import { Badge } from '@/app/_components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { IconButton } from '@/app/_components/ui/icon-button';
import { Item, ItemContent, ItemTitle } from '@/app/_components/ui/item';
import { SearchField } from '@/app/_components/ui/search-field';
import { Spinner } from '@/app/_components/ui/spinner';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { SkillSource, SkillSummary } from '@/src/entities/models/skill';

import { groupSkills, isUnroutable, SKILL_SEARCH_THRESHOLD } from './skill-grouping';

export interface SkillLibraryProps {
  readonly skills: readonly SkillSummary[] | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly query: string;
  readonly selectedName: string | null;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (name: string) => void;
  readonly onDelete: (skill: SkillSummary) => void;
}

const sourceLabelKey = {
  project: 'skills.projectSkills',
  global: 'skills.globalSkills',
} as const satisfies Record<SkillSource, string>;

/**
 * The library half: filter, group, select.
 *
 * The list is the description tier of the skill model. A skill's body loads
 * only once the agent has decided to use it, and that decision is made from the
 * description alone — so the description gets two real lines here rather than
 * the truncated grey caption it used to get.
 */
export function SkillLibrary({
  skills,
  loading,
  busy,
  query,
  selectedName,
  onQueryChange,
  onSelect,
  onDelete,
}: SkillLibraryProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div
        role="status"
        aria-label={t('skills.loading')}
        className="flex items-center gap-2 text-body-sm text-muted-foreground"
      >
        <Spinner aria-hidden="true" />
        {t('skills.loading')}
      </div>
    );
  }

  if (!skills || skills.length === 0) return null;

  const groups = groupSkills(skills, query);
  const searchable = skills.length >= SKILL_SEARCH_THRESHOLD;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4">
      {/* A control appears when it earns its place. Under eight skills the whole
       * library is on screen and a filter is chrome. */}
      {searchable ? (
        <SearchField
          className="shrink-0"
          clearLabel={t('skills.searchClear')}
          onChange={(event) => onQueryChange(event.target.value)}
          onClear={() => onQueryChange('')}
          placeholder={t('skills.searchPlaceholder')}
          aria-label={t('skills.searchLabel')}
          value={query}
        />
      ) : null}

      {groups.length === 0 ? (
        <p className="text-body-sm text-muted-foreground" role="status">
          {t('skills.searchEmpty', { query: query.trim() })}
        </p>
      ) : null}

      {groups.map((group) => {
        const sourceHeadingId = `skill-source-${group.source}`;
        return (
          <section aria-labelledby={sourceHeadingId} key={group.source}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h2 className="text-label text-muted-foreground uppercase" id={sourceHeadingId}>
                {t(sourceLabelKey[group.source])}
              </h2>
              <span className="text-caption tabular-nums text-muted-foreground">
                {t(group.count === 1 ? 'skills.count_one' : 'skills.count_other', {
                  count: group.count,
                })}
              </span>
            </div>
            <div aria-labelledby={sourceHeadingId} className="min-w-0" role="list">
              {group.skills.map((skill) => (
                <SkillRow
                  busy={busy}
                  key={skill.name}
                  onDelete={onDelete}
                  onSelect={onSelect}
                  selected={selectedName === skill.name}
                  skill={skill}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface SkillRowProps {
  readonly skill: SkillSummary;
  readonly selected: boolean;
  readonly busy: boolean;
  readonly onSelect: (name: string) => void;
  readonly onDelete: (skill: SkillSummary) => void;
}

function SkillRow({ skill, selected, busy, onSelect, onDelete }: SkillRowProps) {
  const { t } = useTranslation();
  const unroutable = isUnroutable(skill);

  return (
    <Item
      className={cn(
        'relative flex-nowrap gap-2',
        selected ? 'bg-sidebar-selected' : 'hover:bg-accent/50',
      )}
      role="listitem"
      size="sm"
    >
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle className="max-w-full gap-2">
          {/* The button stretches over the whole row through its ::after, so the
           * target is the row while the menu beside it stays a real sibling
           * rather than a button nested inside another button. */}
          <button
            aria-current={selected ? 'true' : undefined}
            className="truncate rounded-xs text-left after:absolute after:inset-0 after:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            disabled={busy}
            onClick={() => onSelect(skill.name)}
            type="button"
          >
            {skill.name}
          </button>
        </ItemTitle>
        {unroutable ? (
          <p className="flex items-start gap-1.5 text-body-sm text-status-warning-dark">
            <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {t('skills.noDescriptionWarning')}
          </p>
        ) : (
          <p className="line-clamp-2 text-body-sm text-muted-foreground">{skill.description}</p>
        )}
      </ItemContent>

      {skill.source === 'project' ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              className="relative shrink-0"
              disabled={busy}
              label={t('skills.rowMenu', { name: skill.name })}
              size="sm"
              variant="ghost"
            >
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onSelect={() => onDelete(skill)} variant="destructive">
              <Trash2Icon />
              {t('skills.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Badge className="relative shrink-0" variant="outline">
          {t('skills.readOnly')}
        </Badge>
      )}
    </Item>
  );
}
