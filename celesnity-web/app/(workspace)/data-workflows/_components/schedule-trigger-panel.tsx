'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { SelectField, TextField } from '@/app/_components/ui/fields';
import { InlineError, PageAlert } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import type { DataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';
import type { DataWorkflowTrigger } from '@/src/entities/models/data-workflow-graph';
import { validateTrigger } from '@/src/entities/models/data-workflow-graph';
import type {
  DataWorkflowWatchSourceCatalogRelation,
  DataWorkflowWatchSourceCatalogService,
  DataWorkflowWatchSourceCdcTrigger,
  DataWorkflowWatchSourceChangeType,
  DataWorkflowWatchSourcePollingTrigger,
  DataWorkflowWatchSourceValidationResult,
  DataWorkflowWatchSourceWeekday,
} from '@/src/entities/models/data-workflow-watch-source';

interface Props {
  readonly controller: DataWorkflowController;
  readonly trigger: DataWorkflowTrigger;
  readonly onChange: (trigger: DataWorkflowTrigger) => void;
}

const WEEKDAYS: readonly {
  readonly value: DataWorkflowWatchSourceWeekday;
  readonly label: string;
}[] = [
  { value: 'MON', label: 'Monday' },
  { value: 'TUE', label: 'Tuesday' },
  { value: 'WED', label: 'Wednesday' },
  { value: 'THU', label: 'Thursday' },
  { value: 'FRI', label: 'Friday' },
  { value: 'SAT', label: 'Saturday' },
  { value: 'SUN', label: 'Sunday' },
];

export function ScheduleTriggerPanel({ controller, trigger, onChange }: Props) {
  const error = validateTrigger(trigger);
  const [validation, setValidation] = useState<DataWorkflowWatchSourceValidationResult>();
  const [validationError, setValidationError] = useState<string>();
  const [validating, setValidating] = useState(false);

  const updateWatchSource = (
    next: DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger,
  ) => {
    setValidation(undefined);
    setValidationError(undefined);
    onChange(next);
  };

  const validateWatchSource = async () => {
    if (trigger.type !== 'WATCH_SOURCE') return;
    const localError = validateTrigger(trigger);
    if (localError !== undefined) {
      setValidationError(localError);
      return;
    }
    setValidating(true);
    setValidationError(undefined);
    try {
      setValidation(await controller.validateWatchSource(trigger));
    } catch (cause) {
      setValidationError(
        cause instanceof Error ? cause.message : 'The source could not be validated.',
      );
    } finally {
      setValidating(false);
    }
  };

  return (
    <section aria-labelledby="workflow-trigger-heading" className="grid gap-4">
      <div>
        <h2 className="text-sm font-semibold" id="workflow-trigger-heading">
          Trigger
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose when this workflow can start. Only delivered scheduling triggers are shown.
        </p>
      </div>
      <SelectField
        label="Trigger type"
        value={trigger.type}
        data={[
          { value: 'MANUAL', label: 'Manual' },
          { value: 'CALENDAR', label: 'Calendar' },
          { value: 'INTERVAL', label: 'Interval' },
          { value: 'WATCH_SOURCE', label: 'Watch source' },
        ]}
        onChange={(value) => {
          if (value === 'CALENDAR') {
            onChange({
              type: 'CALENDAR',
              timeOfDay: '07:00',
              weekdays: WEEKDAYS.map((weekday) => weekday.value),
              timezone: browserTimezone(),
            });
          } else if (value === 'INTERVAL') {
            onChange({ type: 'INTERVAL', everySeconds: 600, anchorAt: new Date().toISOString() });
          } else if (value === 'WATCH_SOURCE') {
            updateWatchSource(defaultWatchSourceTrigger());
          } else {
            onChange({ type: 'MANUAL' });
          }
        }}
      />
      {trigger.type === 'CALENDAR' ? (
        <CalendarFields trigger={trigger} error={error} onChange={onChange} />
      ) : null}
      {trigger.type === 'INTERVAL' ? (
        <div className="grid gap-3">
          <TextField
            label="Interval seconds"
            type="number"
            min={10}
            step={1}
            value={String(trigger.everySeconds)}
            error={error}
            hint="Whole seconds only; the minimum interval is 10 seconds."
            onChange={(event) =>
              onChange({ ...trigger, everySeconds: Number.parseInt(event.target.value, 10) || 0 })
            }
          />
          <TextField
            label="UTC anchor"
            type="datetime-local"
            value={toLocalInputValue(trigger.anchorAt)}
            error={error}
            hint="This anchor is stored as a UTC instant."
            onChange={(event) => {
              const localValue = event.target.value;
              onChange({
                ...trigger,
                anchorAt: localValue ? new Date(localValue).toISOString() : '',
              });
            }}
          />
        </div>
      ) : null}
      {trigger.type === 'WATCH_SOURCE' ? (
        <WatchSourceFields
          controller={controller}
          trigger={trigger}
          error={error}
          validation={validation}
          validationError={validationError}
          validating={validating}
          onChange={updateWatchSource}
          onValidate={() => void validateWatchSource()}
        />
      ) : null}
    </section>
  );
}

function CalendarFields({
  trigger,
  error,
  onChange,
}: {
  readonly trigger: Extract<DataWorkflowTrigger, { type: 'CALENDAR' }>;
  readonly error?: string;
  readonly onChange: (trigger: DataWorkflowTrigger) => void;
}) {
  const toggleWeekday = (weekday: DataWorkflowWatchSourceWeekday, checked: boolean) => {
    const weekdays = checked
      ? [...new Set([...trigger.weekdays, weekday])]
      : trigger.weekdays.filter((current) => current !== weekday);
    onChange({ ...trigger, weekdays });
  };

  return (
    <div className="grid gap-3">
      <TextField
        label="Time"
        type="time"
        value={trigger.timeOfDay}
        error={error?.includes('time') ? error : undefined}
        onChange={(event) => onChange({ ...trigger, timeOfDay: event.target.value })}
      />
      <fieldset className="grid gap-2" aria-describedby="calendar-day-help">
        <legend className="text-sm font-medium">Days</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {WEEKDAYS.map((weekday) => (
            <label className="flex items-center gap-2 text-sm" key={weekday.value}>
              <input
                type="checkbox"
                checked={trigger.weekdays.includes(weekday.value)}
                onChange={(event) => toggleWeekday(weekday.value, event.target.checked)}
              />
              {weekday.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground" id="calendar-day-help">
          Select one or more days. The schedule uses the selected timezone.
        </p>
      </fieldset>
      <TextField
        label="Timezone"
        value={trigger.timezone}
        placeholder="Asia/Ho_Chi_Minh"
        error={error?.includes('timezone') ? error : undefined}
        hint="Use an IANA timezone such as Asia/Ho_Chi_Minh or UTC."
        onChange={(event) => onChange({ ...trigger, timezone: event.target.value })}
      />
    </div>
  );
}

function WatchSourceFields({
  controller,
  trigger,
  error,
  validation,
  validationError,
  validating,
  onChange,
  onValidate,
}: {
  readonly controller: DataWorkflowController;
  readonly trigger: DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger;
  readonly error?: string;
  readonly validation?: DataWorkflowWatchSourceValidationResult;
  readonly validationError?: string;
  readonly validating: boolean;
  readonly onChange: (
    trigger: DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger,
  ) => void;
  readonly onValidate: () => void;
}) {
  const [services, setServices] = useState<readonly DataWorkflowWatchSourceCatalogService[]>([]);
  const [relationState, setRelationState] = useState<{
    readonly databaseServiceId: string;
    readonly data: readonly DataWorkflowWatchSourceCatalogRelation[];
  }>({ databaseServiceId: '', data: [] });
  const [catalogError, setCatalogError] = useState<string>();
  const [loadingServices, setLoadingServices] = useState(true);
  const relations =
    relationState.databaseServiceId === trigger.databaseServiceId ? relationState.data : [];
  const loadingRelations =
    trigger.databaseServiceId !== '' &&
    relationState.databaseServiceId !== trigger.databaseServiceId;

  useEffect(() => {
    let cancelled = false;
    void controller
      .listWatchSourceCatalog({ page: 1, pageSize: 100 })
      .then((page) => {
        if (!cancelled) setServices(page.data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setCatalogError(
            cause instanceof Error ? cause.message : 'Verified datasources could not be loaded.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingServices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [controller]);

  useEffect(() => {
    let cancelled = false;
    if (!trigger.databaseServiceId) {
      return () => {
        cancelled = true;
      };
    }
    void controller
      .listWatchSourceRelations(trigger.databaseServiceId, { page: 1, pageSize: 100 })
      .then((page) => {
        if (!cancelled) {
          setRelationState({ databaseServiceId: trigger.databaseServiceId, data: page.data });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setRelationState({ databaseServiceId: trigger.databaseServiceId, data: [] });
          setCatalogError(
            cause instanceof Error ? cause.message : 'Datasource tables could not be loaded.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [controller, trigger.databaseServiceId]);

  const selectService = (databaseServiceId: string) => {
    setCatalogError(undefined);
    onChange({ ...trigger, databaseServiceId, relations: [] });
  };
  const selectedService = services.find((service) => service.id === trigger.databaseServiceId);
  const cdcDatabaseName = selectedService?.databaseNames?.[0] ?? selectedService?.databaseName;
  const cdcSetupHref =
    cdcDatabaseName && selectedService
      ? `/databases/${encodeURIComponent(cdcDatabaseName)}/sources/${encodeURIComponent(selectedService.id)}`
      : undefined;

  return (
    <div className="grid gap-4">
      <p className="rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        Selected table changes start this workflow. CDC can include deletes; polling cannot.
      </p>
      <SelectField
        label="Datasource"
        value={trigger.databaseServiceId}
        error={error === 'Choose a verified database service.' ? error : undefined}
        hint="Only verified datasources with metadata are available for table selection."
        data={[
          {
            value: '',
            label: loadingServices ? 'Loading verified datasources…' : 'Choose datasource',
          },
          ...services.map((service) => ({
            value: service.id,
            label: `${service.name} · ${service.connectorType}`,
            disabled: !service.metadataAvailable,
          })),
        ]}
        onChange={selectService}
      />
      <SelectField
        label="Watch mode"
        value={trigger.mode}
        data={[
          { value: 'POLLING', label: 'Polling' },
          { value: 'CDC', label: 'CDC' },
        ]}
        onChange={(value) =>
          onChange(value === 'CDC' ? toCdcTrigger(trigger) : toPollingTrigger(trigger))
        }
      />
      {trigger.mode === 'POLLING' ? (
        <PollingFields
          trigger={trigger}
          error={error}
          relations={relations}
          loadingRelations={loadingRelations}
          catalogError={catalogError}
          onChange={onChange}
        />
      ) : (
        <CdcFields
          trigger={trigger}
          error={error}
          relations={relations}
          loadingRelations={loadingRelations}
          catalogError={catalogError}
          onChange={onChange}
        />
      )}
      <Button type="button" variant="outline" onClick={onValidate} disabled={validating}>
        {validating ? <Spinner className="size-4" /> : null}
        Validate source configuration
      </Button>
      {validationError ? <InlineError>{validationError}</InlineError> : null}
      {validation ? (
        <WatchSourceValidationResult cdcSetupHref={cdcSetupHref} result={validation} />
      ) : null}
    </div>
  );
}

function PollingFields({
  trigger,
  error,
  relations,
  loadingRelations,
  catalogError,
  onChange,
}: {
  readonly trigger: DataWorkflowWatchSourcePollingTrigger;
  readonly error?: string;
  readonly relations: readonly DataWorkflowWatchSourceCatalogRelation[];
  readonly loadingRelations: boolean;
  readonly catalogError?: string;
  readonly onChange: (trigger: DataWorkflowWatchSourcePollingTrigger) => void;
}) {
  return (
    <div className="grid gap-4">
      <TextField
        label="Check source every (seconds)"
        type="number"
        min={10}
        step={1}
        value={String(trigger.everySeconds)}
        error={error?.includes('Polling interval') ? error : undefined}
        hint="Checks for new or changed rows. The minimum interval is 10 seconds."
        onChange={(event) =>
          onChange({ ...trigger, everySeconds: Number.parseInt(event.target.value, 10) || 0 })
        }
      />
      <RelationList
        mode="POLLING"
        trigger={trigger}
        relations={relations}
        loadingRelations={loadingRelations}
        catalogError={catalogError}
        onChange={(next) => {
          if (next.mode === 'POLLING') onChange(next);
        }}
      />
    </div>
  );
}

function CdcFields({
  trigger,
  error,
  relations,
  loadingRelations,
  catalogError,
  onChange,
}: {
  readonly trigger: DataWorkflowWatchSourceCdcTrigger;
  readonly error?: string;
  readonly relations: readonly DataWorkflowWatchSourceCatalogRelation[];
  readonly loadingRelations: boolean;
  readonly catalogError?: string;
  readonly onChange: (trigger: DataWorkflowWatchSourceCdcTrigger) => void;
}) {
  const toggleChangeType = (changeType: DataWorkflowWatchSourceChangeType, checked: boolean) => {
    const changeTypes = checked
      ? [...new Set([...trigger.changeTypes, changeType])]
      : trigger.changeTypes.filter((current) => current !== changeType);
    onChange({ ...trigger, changeTypes });
  };

  return (
    <div className="grid gap-4">
      <TextField
        label="Trigger at most once every (seconds)"
        type="number"
        min={1}
        max={300}
        step={1}
        value={String(trigger.aggregationWindowSeconds)}
        error={error?.includes('aggregation') ? error : undefined}
        hint="The first change starts a fixed window. Later changes join it; the deadline never moves."
        onChange={(event) =>
          onChange({
            ...trigger,
            aggregationWindowSeconds: Number.parseInt(event.target.value, 10) || 0,
          })
        }
      />
      <RelationList
        mode="CDC"
        trigger={trigger}
        relations={relations}
        loadingRelations={loadingRelations}
        catalogError={catalogError}
        onChange={(next) => {
          if (next.mode === 'CDC') onChange(next);
        }}
      />
      <fieldset className="grid gap-2" aria-describedby="cdc-change-help">
        <legend className="text-sm font-medium">CDC events</legend>
        {(['INSERT', 'UPDATE', 'DELETE'] as const).map((changeType) => (
          <label className="flex items-center gap-2 text-sm" key={changeType}>
            <input
              type="checkbox"
              checked={trigger.changeTypes.includes(changeType)}
              onChange={(event) => toggleChangeType(changeType, event.target.checked)}
            />
            {changeType[0] + changeType.slice(1).toLowerCase()}
          </label>
        ))}
        <p className="text-xs text-muted-foreground" id="cdc-change-help">
          Events are grouped for the fixed window. A continuously changing table cannot keep the
          workflow stuck because the window deadline never moves.
        </p>
      </fieldset>
    </div>
  );
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function RelationList({
  mode,
  trigger,
  relations,
  loadingRelations,
  catalogError,
  onChange,
}: {
  readonly mode: 'POLLING' | 'CDC';
  readonly trigger: DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger;
  readonly relations: readonly DataWorkflowWatchSourceCatalogRelation[];
  readonly loadingRelations: boolean;
  readonly catalogError?: string;
  readonly onChange: (
    trigger: DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger,
  ) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');

  const selectedKeys = new Set(trigger.relations.map((relation) => relationKey(relation)));
  const availableRelations = relations.filter(
    (relation) => !selectedKeys.has(relationKey(relation)),
  );

  const addRelation = () => {
    const selected = availableRelations.find((relation) => relationKey(relation) === selectedKey);
    if (selected === undefined) return;
    if (mode === 'POLLING') {
      const polling = trigger as DataWorkflowWatchSourcePollingTrigger;
      onChange({
        ...polling,
        relations: [
          ...polling.relations,
          {
            schema: selected.schema,
            table: selected.table,
            cursor: defaultCursor(selected),
          },
        ],
      });
    } else {
      const cdc = trigger as DataWorkflowWatchSourceCdcTrigger;
      onChange({
        ...cdc,
        relations: [...cdc.relations, { schema: selected.schema, table: selected.table }],
      });
    }
    setSelectedKey('');
    setPickerOpen(false);
  };

  return (
    <div className="grid gap-3" aria-label="Watched source tables">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Tables to watch</h3>
          <p className="text-xs text-muted-foreground">
            Add tables from verified datasource metadata.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen((open) => !open)}
          disabled={loadingRelations || availableRelations.length === 0}
        >
          Add table
        </Button>
      </div>
      {pickerOpen ? (
        <Card className="grid gap-3 border-dashed p-3">
          <SelectField
            label="Table from datasource metadata"
            value={selectedKey}
            data={[
              {
                value: '',
                label: loadingRelations ? 'Loading tables…' : 'Choose a table',
              },
              ...availableRelations.map((relation) => ({
                value: relationKey(relation),
                label: `${relation.schema}.${relation.table}`,
              })),
            ]}
            onChange={setSelectedKey}
          />
          <Button type="button" size="sm" onClick={addRelation} disabled={!selectedKey}>
            Add selected table
          </Button>
        </Card>
      ) : null}
      {catalogError ? <InlineError>{catalogError}</InlineError> : null}
      {!loadingRelations && relations.length === 0 ? (
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          Choose a verified datasource to load tables from its metadata.
        </p>
      ) : null}
      {trigger.relations.map((relation, index) => (
        <Card className="grid gap-3 p-3" key={`${relation.schema}.${relation.table}-${index}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {relation.schema}.{relation.table}
              </p>
              <p className="text-xs text-muted-foreground">Selected from verified metadata</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRelation(trigger, onChange, index)}
            >
              Remove
            </Button>
          </div>
          {mode === 'POLLING' && 'cursor' in relation ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Change column"
                value={relation.cursor.changeColumn}
                hint="A timestamp or sequence column."
                onChange={(event) =>
                  onChange({
                    ...(trigger as DataWorkflowWatchSourcePollingTrigger),
                    relations: (trigger as DataWorkflowWatchSourcePollingTrigger).relations.map(
                      (current, relationIndex) =>
                        relationIndex === index
                          ? {
                              ...current,
                              cursor: { ...current.cursor, changeColumn: event.target.value },
                            }
                          : current,
                    ),
                  })
                }
              />
              <TextField
                label="Tie-breaker column"
                value={relation.cursor.tieBreakerColumn}
                hint="A stable unique column for equal change values."
                onChange={(event) =>
                  onChange({
                    ...(trigger as DataWorkflowWatchSourcePollingTrigger),
                    relations: (trigger as DataWorkflowWatchSourcePollingTrigger).relations.map(
                      (current, relationIndex) =>
                        relationIndex === index
                          ? {
                              ...current,
                              cursor: { ...current.cursor, tieBreakerColumn: event.target.value },
                            }
                          : current,
                    ),
                  })
                }
              />
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function relationKey(relation: { readonly schema: string; readonly table: string }): string {
  return `${relation.schema}.${relation.table}`;
}

function defaultCursor(relation: DataWorkflowWatchSourceCatalogRelation): {
  readonly changeColumn: string;
  readonly tieBreakerColumn: string;
} {
  const changeColumn = relation.columns.find((column) =>
    /^(updated|modified|changed|created)_?at$/i.test(column.name),
  );
  const tieBreakerColumn = relation.columns.find((column) => /^id$/i.test(column.name));
  return {
    changeColumn: changeColumn?.name ?? 'updated_at',
    tieBreakerColumn: tieBreakerColumn?.name ?? 'id',
  };
}

function removeRelation(
  trigger: DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger,
  onChange: (
    trigger: DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger,
  ) => void,
  index: number,
): void {
  onChange({
    ...trigger,
    relations: trigger.relations.filter((_, relationIndex) => relationIndex !== index),
  } as DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger);
}

function WatchSourceValidationResult({
  cdcSetupHref,
  result,
}: {
  readonly cdcSetupHref?: string;
  readonly result: DataWorkflowWatchSourceValidationResult;
}) {
  const preflight = result.cdcPreflight;
  const ready = result.issues.length === 0 && (preflight === undefined || preflight.available);
  return ready ? (
    <PageAlert tone="success" title="Source is ready">
      {result.capabilities.connectorType} source watching is available.
    </PageAlert>
  ) : (
    <PageAlert tone="warning" title="Source needs attention">
      <ul className="list-disc space-y-1 pl-5">
        {result.issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`}>{watchSourceIssueLabel(issue.code)}</li>
        ))}
        {preflight !== undefined && !preflight.available ? (
          <li>
            {preflight.message}
            {preflight.remediation === undefined ? '' : ` ${preflight.remediation}`}
            {cdcSetupHref === undefined ? null : (
              <div className="mt-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={cdcSetupHref}>Configure CDC connection</Link>
                </Button>
              </div>
            )}
          </li>
        ) : null}
      </ul>
    </PageAlert>
  );
}

function watchSourceIssueLabel(code: string): string {
  switch (code) {
    case 'UNSUPPORTED_CONNECTOR':
      return 'This connector is not supported for the selected watch mode.';
    case 'NO_RELIABLE_CURSOR':
      return 'Choose a reliable change column and tie-breaker for every polling table.';
    case 'UNSUPPORTED_CHANGE_TYPE':
      return 'One selected CDC event is not supported by this connector.';
    case 'RELATION_NOT_AVAILABLE':
      return 'A selected table is not available in verified metadata.';
    case 'CURSOR_COLUMN_NOT_AVAILABLE':
      return 'A cursor column is not available in verified metadata.';
    default:
      return 'The source configuration is not ready.';
  }
}

function defaultWatchSourceTrigger(): DataWorkflowWatchSourcePollingTrigger {
  return {
    type: 'WATCH_SOURCE',
    mode: 'POLLING',
    databaseServiceId: '',
    everySeconds: 600,
    relations: [],
  };
}

function toPollingTrigger(
  trigger: DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger,
): DataWorkflowWatchSourcePollingTrigger {
  return {
    type: 'WATCH_SOURCE',
    mode: 'POLLING',
    databaseServiceId: trigger.databaseServiceId,
    everySeconds: trigger.mode === 'POLLING' ? trigger.everySeconds : 600,
    relations:
      trigger.mode === 'POLLING'
        ? trigger.relations
        : trigger.relations.map((relation) => ({
            ...relation,
            cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
          })),
  };
}

function toCdcTrigger(
  trigger: DataWorkflowWatchSourcePollingTrigger | DataWorkflowWatchSourceCdcTrigger,
): DataWorkflowWatchSourceCdcTrigger {
  return {
    type: 'WATCH_SOURCE',
    mode: 'CDC',
    databaseServiceId: trigger.databaseServiceId,
    aggregationWindowSeconds: 10,
    relations: trigger.relations.map(({ schema, table }) => ({ schema, table })),
    changeTypes: ['INSERT', 'UPDATE', 'DELETE'],
  };
}

function toLocalInputValue(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}
