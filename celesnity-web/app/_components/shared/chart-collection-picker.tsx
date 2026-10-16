'use client';

import { useMemo, useState } from 'react';
import { CheckIcon, ChevronsUpDownIcon, FolderIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/_components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/_components/ui/popover';
import { cn } from '@/app/_components/ui/utils';
import type { ChartCollection } from '@/src/entities/models/chart-collection';

import { flattenCollectionOptions } from './chart-collection-options';

export interface ChartCollectionPickerProps {
  readonly collections: readonly ChartCollection[];
  readonly value: string;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly onChange: (collectionId: string) => void;
}

/** Searchable save destination picker. Only collections with Curate access are valid targets. */
export function ChartCollectionPicker({
  collections,
  value,
  loading = false,
  disabled = false,
  onChange,
}: ChartCollectionPickerProps) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => flattenCollectionOptions(collections), [collections]);
  const selected = options.find(({ collection }) => collection.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Destination collection"
          aria-expanded={open}
          disabled={disabled || loading}
          className="h-11 w-full justify-between px-3 font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <FolderIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {loading ? 'Loading collections…' : (selected?.path ?? 'Choose a collection')}
            </span>
          </span>
          <ChevronsUpDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput aria-label="Search collections" placeholder="Search collections…" />
          <CommandList>
            <CommandEmpty>No collections with Curate access found.</CommandEmpty>
            <CommandGroup heading="Collections">
              {options.map(({ collection, path }) => (
                <CommandItem
                  key={collection.id}
                  value={`${path} ${collection.name}`}
                  onSelect={() => {
                    onChange(collection.id);
                    setOpen(false);
                  }}
                >
                  <FolderIcon aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{path}</span>
                  <CheckIcon
                    aria-hidden="true"
                    className={cn('ml-auto', collection.id === value ? 'opacity-100' : 'opacity-0')}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
