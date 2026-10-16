'use client';

import Link from 'next/link';
import { useState } from 'react';

import { cn } from '@/app/_components/ui/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { SearchField } from '@/app/_components/ui/search-field';
import { Skeleton } from '@/app/_components/ui/skeleton';
import type { NodePaletteGroupViewModel } from '@/src/interface-adapters/presenters/node-definition.presenter';

import { NODE_DRAG_MIME } from './flow-canvas';
import { databaseTabHref } from '../../../_components/database-screen';

interface NodePaletteProps {
  readonly groups?: readonly NodePaletteGroupViewModel[];
  /** Where the "add a connection" link goes when there are no sources yet. */
  readonly databaseName: string;
  readonly keyword: string;
  readonly disabled: boolean;
  readonly onKeywordChange: (keyword: string) => void;
  readonly onAddDefinition: (resourceId: string) => void;
}

const emptyCopy: Readonly<Record<string, string>> = {
  SOURCE: 'Sources come from verified connections.',
  TRANSFORM: 'No transform matches this search.',
  TARGET: 'Targets come from the managed Iceberg catalog.',
};

export function NodePalette({
  groups,
  databaseName,
  keyword,
  disabled,
  onKeywordChange,
  onAddDefinition,
}: NodePaletteProps) {
  // Sources first: a graph starts there, and the transform list is long enough
  // that stacking all three made finding a target a scroll rather than a click.
  const [group, setGroup] = useState('SOURCE');
  return (
    <div className="grid min-w-0 content-start gap-4 p-[17px]">
      <div>
        <h2 className="m-0 text-body-lg font-medium tracking-[-0.02em]">Nodes</h2>
        <p className="mt-1 text-caption text-muted-foreground">
          Drag onto the canvas, or press Add to drop one in place.
        </p>
      </div>

      <SearchField
        label="Search nodes"
        onChange={(event) => onKeywordChange(event.target.value)}
        onClear={() => onKeywordChange('')}
        placeholder="Filter by label"
        value={keyword}
      />

      {!groups ? (
        <div className="grid gap-2" role="status" aria-label="Loading node catalogue">
          <Skeleton className="h-[54px] rounded-lg" />
          <Skeleton className="h-[54px] rounded-lg" />
          <Skeleton className="h-[54px] rounded-lg" />
        </div>
      ) : null}

      {groups ? (
        <Tabs className="min-w-0" onValueChange={setGroup} value={group}>
          {/* A three-column grid rather than flex: the triggers have to share a
           * ~250px rail, and flex sizes them to their content, which pushed the
           * last one out of the panel and widened everything inside it. */}
          <TabsList className="grid w-full min-w-0 grid-cols-3">
            {/* Label only. A count beside it wanted the width the label itself
             * needs on a ~90px trigger, and a group reading "Transfor…" is
             * worse than one whose size you read off the list underneath. */}
            {groups.map((paletteGroup) => (
              <TabsTrigger
                className="min-w-0 px-1.5 text-caption"
                key={paletteGroup.type}
                value={paletteGroup.type}
              >
                {paletteGroup.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {groups.map((paletteGroup) => (
            <TabsContent className="min-w-0" key={paletteGroup.type} value={paletteGroup.type}>
              {/* The tab already names the group; a heading here would say it
               * a second time. */}
              <section className="grid gap-2" aria-label={paletteGroup.label}>
                {paletteGroup.definitions.length === 0 ? (
                  <p className="text-caption leading-[1.5] text-muted-foreground">
                    {emptyCopy[paletteGroup.type] ?? 'Nothing here yet.'}
                    {paletteGroup.type === 'SOURCE' ? (
                      <>
                        {' '}
                        <Link
                          className="font-semibold text-primary underline"
                          href={databaseTabHref(databaseName, 'sources')}
                        >
                          Add a connection
                        </Link>
                        .
                      </>
                    ) : null}
                  </p>
                ) : null}

                {paletteGroup.definitions.map((definition) => (
                  <div
                    className={cn(
                      'grid gap-[3px] rounded-md border border-border bg-card p-[10px]',
                      definition.enabled ? 'cursor-grab' : 'opacity-60',
                    )}
                    key={definition.resourceId}
                    draggable={definition.enabled && !disabled}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(NODE_DRAG_MIME, definition.resourceId);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-caption wrap-anywhere">{definition.label}</strong>
                      <button
                        className="cursor-pointer rounded-md border-0 bg-accent px-[7px] py-[3px] text-micro font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        disabled={!definition.enabled || disabled}
                        onClick={() => onAddDefinition(definition.resourceId)}
                      >
                        Add
                      </button>
                    </div>
                    <span className="text-micro leading-[1.45] text-muted-foreground">
                      {definition.resourceLabel ?? definition.description}
                    </span>
                    {definition.enabled ? null : (
                      <span className="text-micro font-semibold text-destructive">
                        Connection is not verified
                      </span>
                    )}
                  </div>
                ))}
              </section>
            </TabsContent>
          ))}
        </Tabs>
      ) : null}
    </div>
  );
}
