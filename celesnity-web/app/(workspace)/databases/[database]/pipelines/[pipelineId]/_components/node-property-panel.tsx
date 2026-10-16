'use client';

import { Button } from '@/app/_components/ui/button';
import { InlineError } from '@/app/_components/ui/page-alert';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { Spinner } from '@/app/_components/ui/spinner';
import type { NodePropertyOption } from '@/src/entities/models/node-definition';
import type { PipelineNode, PipelineValidationIssue } from '@/src/entities/models/pipeline';
import type { NodeDefinitionViewModel } from '@/src/interface-adapters/presenters/node-definition.presenter';

import { PropertyField } from './property-field';

interface NodePropertyPanelProps {
  readonly node?: PipelineNode;
  readonly definition?: NodeDefinitionViewModel;
  readonly definitionError?: string;
  readonly propertyOptionsError?: string;
  readonly fieldOptions?: Readonly<Record<string, readonly NodePropertyOption[]>>;
  readonly loadingFields?: ReadonlySet<string>;
  readonly issues: readonly PipelineValidationIssue[];
  readonly disabled: boolean;
  readonly isPreviewing: boolean;
  readonly canPreview: boolean;
  readonly onConfigChange: (change: Readonly<Record<string, unknown>>) => void;
  readonly onRemove: () => void;
  readonly onPreview: () => void;
}

export function NodePropertyPanel({
  node,
  definition,
  definitionError,
  propertyOptionsError,
  fieldOptions = {},
  loadingFields = new Set(),
  issues,
  disabled,
  isPreviewing,
  canPreview,
  onConfigChange,
  onRemove,
  onPreview,
}: NodePropertyPanelProps) {
  if (!node) {
    return (
      <div className="grid content-start gap-2 p-[17px]">
        <h2 className="m-0 text-body-lg font-medium tracking-[-0.02em]">Properties</h2>
        <p className="text-caption leading-[1.55] text-muted-foreground">
          Select a node on the canvas to configure it.
        </p>
      </div>
    );
  }

  const fieldIssues = new Map(
    issues
      .filter((issue) => issue.severity !== 'WARNING' && issue.field !== undefined)
      .map((issue) => [issue.field, issue.message]),
  );
  const nodeIssues = issues.filter(
    (issue) => issue.severity !== 'WARNING' && issue.field === undefined,
  );
  const runtimeChecks = issues.filter((issue) => issue.severity === 'WARNING');
  const propertyFields =
    definition?.propertyPanel.sections.flatMap((section) => section.fields) ?? [];

  return (
    <div className="grid content-start gap-4 p-[17px]">
      <div>
        <span className="mb-[5px] block text-micro font-[750] tracking-[0.12em] text-primary uppercase">
          {definition?.category ?? 'Node'}
        </span>
        <h2 className="m-0 text-body-lg font-medium tracking-[-0.02em] wrap-anywhere">
          {definition?.label ?? node.definitionType}
        </h2>
        {definition?.resourceLabel ? (
          <p className="mt-1 font-mono text-micro wrap-anywhere text-muted-foreground">
            {definition.resourceLabel}
          </p>
        ) : null}
      </div>

      {nodeIssues.length > 0 ? (
        <ul className="m-0 grid list-none gap-[5px] rounded-lg bg-destructive/10 p-[11px] text-caption leading-[1.45] text-destructive">
          {nodeIssues.map((issue) => (
            <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      {runtimeChecks.length > 0 ? (
        <div className="grid gap-1 rounded-lg border border-status-warning/40 bg-status-warning-light p-[11px] text-caption leading-[1.45] text-status-warning-dark">
          <strong>Runtime schema check — Save and Run are allowed</strong>
          <ul className="m-0 grid list-none gap-1 p-0">
            {runtimeChecks.map((issue) => (
              <li key={`${issue.code}-${issue.field ?? ''}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {definitionError ? (
        <p className="rounded-lg bg-destructive/10 p-[11px] text-caption leading-[1.5] text-destructive">
          {definitionError}
        </p>
      ) : null}

      {propertyOptionsError ? (
        <div role="alert">
          <InlineError>{propertyOptionsError}</InlineError>
        </div>
      ) : null}

      {!definition && !definitionError ? (
        <div className="grid gap-2" role="status" aria-label="Loading node properties">
          <Skeleton className="h-[42px] rounded-lg" />
          <Skeleton className="h-[42px] rounded-lg" />
        </div>
      ) : null}

      {definition?.propertyPanel.sections.map((section) => (
        <section className="grid gap-3" key={section.id} aria-labelledby={`section-${section.id}`}>
          <h3
            className="m-0 border-b border-border pb-[7px] text-micro font-[750] tracking-[0.12em] text-primary uppercase"
            id={`section-${section.id}`}
          >
            {section.title}
          </h3>
          {section.fields
            .filter(
              (field) =>
                dependenciesSatisfied(field.dependsOn, node.config) &&
                visibilitySatisfied(field.visibleWhen, node.config, propertyFields),
            )
            .map((field) => (
              <PropertyField
                key={field.key}
                field={field}
                value={node.config[field.key] ?? field.defaultValue}
                disabled={disabled}
                loading={loadingFields.has(field.key)}
                {...(fieldOptions[field.key] ? { options: fieldOptions[field.key] } : {})}
                {...(fieldIssues.get(field.key) ? { issue: fieldIssues.get(field.key) } : {})}
                onChange={(value) => onConfigChange({ [field.key]: value })}
              />
            ))}
        </section>
      ))}

      <div className="grid gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          disabled={disabled || !canPreview || isPreviewing}
          onClick={onPreview}
        >
          {isPreviewing ? (
            <>
              <Spinner />
              Previewing…
            </>
          ) : (
            'Preview data'
          )}
        </Button>
        {canPreview ? null : (
          <small className="text-micro leading-[1.4] text-muted-foreground">
            Save the pipeline before previewing this node.
          </small>
        )}
        <Button variant="destructive-ghost" disabled={disabled} onClick={onRemove}>
          Remove node
        </Button>
      </div>
    </div>
  );
}

function visibilitySatisfied(
  condition: { readonly field: string; readonly equals: unknown } | undefined,
  config: Readonly<Record<string, unknown>>,
  fields: readonly NodePropertyOptionController[],
): boolean {
  if (condition === undefined) {
    return true;
  }
  const controller = fields.find((field) => field.key === condition.field);
  return (config[condition.field] ?? controller?.defaultValue) === condition.equals;
}

type NodePropertyOptionController = {
  readonly key: string;
  readonly defaultValue?: unknown;
};

/** A dependent field stays hidden until every field it depends on has a value. */
function dependenciesSatisfied(
  dependsOn: readonly string[] | undefined,
  config: Readonly<Record<string, unknown>>,
): boolean {
  return (dependsOn ?? []).every((key) => {
    const value = config[key];
    return typeof value === 'string' ? value.trim().length > 0 : value !== undefined;
  });
}
