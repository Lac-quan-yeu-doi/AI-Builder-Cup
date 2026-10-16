'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronRightIcon,
  HashIcon,
  SearchIcon,
  Table2Icon,
  ToggleLeftIcon,
  TypeIcon,
} from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/_components/ui/popover';
import type {
  FieldGroupViewModel,
  FieldOptionViewModel,
} from '@/src/interface-adapters/presenters/chart-builder-field.presenter';

import { useNotebookEditor } from './notebook-editor-context';

export interface GroupedFieldPickerProps {
  readonly editorId: string;
  readonly ariaLabel: string;
  readonly groups: readonly FieldGroupViewModel[];
  readonly trigger: ReactNode;
  readonly defaultOpen?: boolean;
  readonly selectedIds?: readonly string[];
  readonly mode?: 'SINGLE' | 'MULTIPLE';
  readonly onSelect: (field: FieldOptionViewModel) => void;
  readonly onToggle?: (field: FieldOptionViewModel) => void;
  readonly onToggleAll?: (selected: boolean) => void;
  readonly flattenSingleGroup?: boolean;
  readonly showSearch?: boolean;
  /** Defaults on: the family icon is how you tell `machine` from `event_time`
   * without opening the table. */
  readonly showTypeIcons?: boolean;
}

export function GroupedFieldPicker({
  editorId,
  ariaLabel,
  groups,
  trigger,
  defaultOpen = false,
  selectedIds = [],
  mode = 'SINGLE',
  onSelect,
  onToggle,
  onToggleAll,
  flattenSingleGroup = false,
  showSearch = true,
  showTypeIcons = true,
}: GroupedFieldPickerProps) {
  const { open, setOpen } = useNotebookEditor(editorId);
  const [search, setSearch] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const [activeOption, setActiveOption] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectAllRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen, setOpen]);

  useEffect(() => {
    if (!open && wasOpenRef.current) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          fields: group.fields.filter(
            (field) =>
              !normalizedSearch ||
              normalizedSearch
                .split(/\s+/u)
                .every((term) =>
                  `${group.label} ${field.label} ${field.name}`.toLocaleLowerCase().includes(term),
                ),
          ),
        }))
        .filter((group) => !normalizedSearch || group.fields.length > 0),
    [groups, normalizedSearch],
  );

  const options = visibleGroups.flatMap((group) =>
    group.fields.map((field) => ({ groupId: group.id, field })),
  );
  const allSelected =
    options.length > 0 && options.every(({ field }) => selectedIds.includes(field.id));
  const flatGroup = flattenSingleGroup && visibleGroups.length === 1 ? visibleGroups[0] : undefined;

  function isExpanded(groupId: string): boolean {
    return normalizedSearch ? true : expandedGroup === groupId;
  }

  function selectField(field: FieldOptionViewModel): void {
    if (mode === 'MULTIPLE') {
      onToggle?.(field);
      if (!onToggle) onSelect(field);
      return;
    }
    onSelect(field);
    setOpen(false);
  }

  function changeOpen(nextOpen: boolean): void {
    if (nextOpen) {
      setSearch('');
      setExpandedGroup(groups.length === 1 ? (groups[0]?.id ?? null) : null);
      setActiveOption(0);
    }
    setOpen(nextOpen);
  }

  function onPickerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (
      event.target instanceof HTMLButtonElement &&
      event.target.getAttribute('role') !== 'option'
    ) {
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
    if (!options.length) return;
    event.preventDefault();
    const delta = event.key === 'ArrowUp' ? -1 : 1;
    if (event.key === 'Enter') {
      const option = options[activeOption];
      if (option) selectField(option.field);
      return;
    }
    const next = (activeOption + delta + options.length) % options.length;
    setActiveOption(next);
    optionRefs.current[next]?.focus();
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger ref={triggerRef} asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={ariaLabel}
        className="w-90 overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (showSearch) searchRef.current?.focus();
          else (selectAllRef.current ?? optionRefs.current[0])?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
        onKeyDown={onPickerKeyDown}
      >
        {showSearch ? (
          <div className="flex h-11 items-center gap-2 border-b border-border px-3">
            <SearchIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            <input
              ref={searchRef}
              type="search"
              role="searchbox"
              aria-label="Find fields"
              placeholder="Find..."
              className="h-full min-w-0 flex-1 bg-transparent text-body-sm outline-none placeholder:text-muted-foreground"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        ) : null}
        <div className="max-h-90 overflow-y-auto">
          {mode === 'MULTIPLE' && onToggleAll ? (
            <button
              ref={selectAllRef}
              type="button"
              className="flex min-h-11 w-full items-center gap-2 border-b border-border px-3 text-left text-body-sm text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Select all ${flatGroup?.label ?? 'visible'} fields`}
              aria-pressed={allSelected}
              onClick={() => onToggleAll(!allSelected)}
            >
              <SelectionMark selected={allSelected} />
              <span>Select all</span>
            </button>
          ) : null}
          <div role="listbox" aria-label={`${ariaLabel} options`}>
            {flatGroup ? (
              <div className="py-1">
                {flatGroup.fields.map((field) => {
                  const optionIndex = options.findIndex((option) => option.field.id === field.id);
                  const selected = selectedIds.includes(field.id);
                  return (
                    <button
                      ref={(node) => {
                        optionRefs.current[optionIndex] = node;
                      }}
                      key={field.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-body-sm text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onFocus={() => setActiveOption(Math.max(optionIndex, 0))}
                      onClick={() => selectField(field)}
                    >
                      {mode === 'MULTIPLE' ? <SelectionMark selected={selected} /> : null}
                      {showTypeIcons ? <FieldFamilyIcon family={field.family} /> : null}
                      <span className="min-w-0 flex-1 truncate">{field.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              visibleGroups.map((group, groupIndex) => (
                <div key={group.id} className={groupIndex ? 'border-t border-border' : undefined}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-body-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${group.label} fields`}
                    aria-expanded={isExpanded(group.id)}
                    onClick={() => setExpandedGroup(isExpanded(group.id) ? null : group.id)}
                  >
                    <Table2Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className={`size-4 transition-transform ${isExpanded(group.id) ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {isExpanded(group.id) ? (
                    <div className="pb-1">
                      {group.fields.map((field) => {
                        const optionIndex = options.findIndex(
                          (option) => option.field.id === field.id,
                        );
                        const selected = selectedIds.includes(field.id);
                        return (
                          <button
                            ref={(node) => {
                              optionRefs.current[optionIndex] = node;
                            }}
                            key={field.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className="flex min-h-10 w-full items-center gap-2 px-4 pl-9 text-left text-body-sm text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onFocus={() => setActiveOption(Math.max(optionIndex, 0))}
                            onClick={() => selectField(field)}
                          >
                            {mode === 'MULTIPLE' ? <SelectionMark selected={selected} /> : null}
                            {showTypeIcons ? <FieldFamilyIcon family={field.family} /> : null}
                            <span className="min-w-0 flex-1 truncate">{field.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ))
            )}
            {!visibleGroups.length ? (
              <p className="px-3 py-6 text-center text-body-sm text-muted-foreground" role="status">
                No fields found.
              </p>
            ) : null}
          </div>
        </div>
        <div className="border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-body-sm"
            disabled
          >
            <ChevronRightIcon aria-hidden="true" className="size-4" /> Custom expression
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SelectionMark({ selected }: { readonly selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-5 shrink-0 items-center justify-center rounded-xs border ${
        selected
          ? 'border-ring/30 bg-sidebar-selected text-foreground'
          : 'border-input bg-background'
      }`}
    >
      {selected ? <CheckIcon className="size-3.5" /> : null}
    </span>
  );
}

function FieldFamilyIcon({ family }: { readonly family: FieldOptionViewModel['family'] }) {
  const className = 'size-4 shrink-0 text-muted-foreground';
  if (family === 'NUMBER') return <HashIcon aria-hidden="true" className={className} />;
  if (family === 'DATE') return <CalendarDaysIcon aria-hidden="true" className={className} />;
  if (family === 'BOOLEAN') return <ToggleLeftIcon aria-hidden="true" className={className} />;
  return <TypeIcon aria-hidden="true" className={className} />;
}
