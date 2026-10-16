'use client';

import { XIcon } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import type {
  DatabaseServiceConnectorDescriptor,
  DatabaseServiceInput,
  DatabaseServiceUpdateInput,
} from '@/src/entities/models/database-service';
import type {
  DatabaseServiceVerificationViewModel,
  DatabaseServiceViewModel,
} from '@/src/interface-adapters/presenters/database-service.presenter';
import { contextualErrorMessage } from '@/app/_components/shared/error-message';
import { Button } from '@/app/_components/ui/button';
import { PasswordField, SelectField, TextField } from '@/app/_components/ui/fields';
import { InlineError } from '@/app/_components/ui/page-alert';
import { cn } from '@/app/_components/ui/utils';
import { VerificationResult } from './verification-result';

interface DatabaseServiceFormProps {
  readonly mode: 'create' | 'edit';
  /**
   * Links the new source to this catalog database. Passed rather than picked
   * in the form: the caller is already inside the database, and offering the
   * choice again would let the two disagree.
   */
  readonly initialDatabaseName?: string;
  /**
   * Drops the form's own heading and close control. A dialog already supplies
   * both, and rendering them twice gives the panel two titles and two crosses.
   */
  readonly embedded?: boolean;
  readonly descriptors: readonly DatabaseServiceConnectorDescriptor[];
  readonly initialService?: DatabaseServiceViewModel;
  readonly onTest: (
    connectorType: string,
    details: Record<string, unknown>,
  ) => Promise<DatabaseServiceVerificationViewModel>;
  readonly onSave: (
    input: DatabaseServiceInput | DatabaseServiceUpdateInput,
  ) => Promise<DatabaseServiceViewModel>;
  readonly onSaved: (service: DatabaseServiceViewModel) => void;
  readonly onCancel: () => void;
}

export function DatabaseServiceForm({
  mode,
  initialDatabaseName,
  embedded = false,
  descriptors,
  initialService,
  onTest,
  onSave,
  onSaved,
  onCancel,
}: DatabaseServiceFormProps) {
  const initialConnector = initialService?.connectorType ?? descriptors[0]?.connectorType ?? '';
  const [name, setName] = useState(initialService?.name ?? '');
  const [connectorType, setConnectorType] = useState(initialConnector);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initialService?.config ? Object.entries(initialService.config) : []).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      ]),
    ),
  );
  const [testResult, setTestResult] = useState<DatabaseServiceVerificationViewModel>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState<'test' | 'save' | undefined>();

  const descriptor = useMemo(
    () => descriptors.find((item) => item.connectorType === connectorType),
    [connectorType, descriptors],
  );
  const structuredFields =
    descriptor?.formSchema.fields.filter((field) => field.mode !== 'url') ?? [];
  const urlFields = descriptor?.formSchema.fields.filter((field) => field.mode === 'url') ?? [];

  const setValue = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setTestResult(undefined);
  };

  const switchConnector = (next: string) => {
    if (mode === 'edit') return;
    setConnectorType(next);
    setValues({});
    setTestResult(undefined);
    setFormError(undefined);
  };

  const buildDetails = (): Record<string, unknown> => {
    const fields = descriptor?.formSchema.fields ?? [];
    const details: Record<string, unknown> = {};
    for (const field of fields) {
      const value = values[field.key]?.trim() ?? '';
      if (!value) continue;
      details[field.key] = field.type === 'number' ? Number(value) : value;
    }
    return details;
  };

  const handleTest = async () => {
    if (!connectorType) {
      setFormError('Select a database connector first.');
      return;
    }
    setFormError(undefined);
    setPending('test');
    try {
      setTestResult(await onTest(connectorType, buildDetails()));
    } catch (error) {
      // Core's own reason, not a generic line: it is the difference between
      // "check the Core API" and "Database type FTPS is not supported."
      setFormError(
        contextualErrorMessage(
          error,
          'The data connection test could not be completed. Check the Core API.',
        ),
      );
    } finally {
      setPending(undefined);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !connectorType) {
      setFormError('Provide a name and select a database connector.');
      return;
    }
    setFormError(undefined);
    setPending('save');
    try {
      const details = buildDetails();
      const input =
        mode === 'create'
          ? {
              name: name.trim(),
              ...(initialDatabaseName === undefined ? {} : { initialDatabaseName }),
              connectorType,
              details,
            }
          : { name: name.trim(), details };
      onSaved(await onSave(input));
    } catch (error) {
      setFormError(
        contextualErrorMessage(
          error,
          'The data connection could not be saved. Review the details and try again.',
        ),
      );
    } finally {
      setPending(undefined);
    }
  };

  return (
    <form
      className={cn('grid gap-[19px]', embedded ? 'p-0' : 'p-[18px] md:p-6')}
      onSubmit={handleSubmit}
    >
      <div className={cn('flex items-start justify-between gap-[18px] pb-1', embedded && 'hidden')}>
        <div>
          <span className="mb-[7px] block text-micro font-[750] tracking-[0.12em] text-primary uppercase">
            {mode === 'create' ? 'New data connection' : 'Edit data connection'}
          </span>
          <h2 className="m-0 text-title">
            {mode === 'create' ? 'Register a data connection' : initialService?.name}
          </h2>
        </div>
        <Button
          disabled={pending !== undefined}
          onClick={onCancel}
          size="icon-sm"
          variant="ghost"
          aria-label="Close editor"
        >
          <XIcon />
        </Button>
      </div>

      <TextField
        label="Service name"
        data-tutorial-target="database-source-service-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Orders warehouse"
        autoComplete="off"
      />

      <SelectField
        label="Database connector"
        data-tutorial-target="database-source-connector"
        hint={mode === 'edit' ? 'Connector type is immutable after creation.' : undefined}
        value={connectorType}
        disabled={mode === 'edit'}
        onChange={switchConnector}
        data={[
          { label: 'Select connector', value: '', disabled: true },
          ...descriptors.map((item) => ({
            label: `${item.label} (${item.connectorType})`,
            value: item.connectorType,
          })),
        ]}
      />

      {urlFields.length > 0 ? (
        <PasswordField
          label="Connection URL"
          hint="Optional URL mode"
          inputClassName="font-mono"
          value={values[urlFields[0]?.key ?? ''] ?? ''}
          onChange={(event) => setValue(urlFields[0]?.key ?? 'connectionUrl', event.target.value)}
          placeholder={urlFields[0]?.placeholder ?? 'Connector URL'}
          autoComplete="new-password"
          spellCheck={false}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-x-3 gap-y-[15px] sm:grid-cols-2">
        {structuredFields.map((field) => {
          const value = values[field.key] ?? '';
          const inputType =
            field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text';
          const shared = {
            className: field.type === 'url' ? 'col-span-full' : undefined,
            label: field.label,
            ...(field.secret && mode === 'edit'
              ? { hint: 'Leave blank to preserve the saved credential.' }
              : {}),
          };

          if (field.type === 'select') {
            return (
              <SelectField
                key={field.key}
                {...shared}
                value={value}
                onChange={(next) => setValue(field.key, next)}
                data={[
                  { label: `Select ${field.label.toLowerCase()}`, value: '' },
                  ...(field.options ?? []),
                ]}
              />
            );
          }

          return (
            <TextField
              key={field.key}
              {...shared}
              data-tutorial-target={`database-source-field-${field.key}`}
              type={inputType}
              value={value}
              onChange={(event) => setValue(field.key, event.target.value)}
              placeholder={field.placeholder ?? field.label}
              autoComplete={field.secret ? 'new-password' : 'off'}
            />
          );
        })}
      </div>

      {formError ? <InlineError>{formError}</InlineError> : null}
      {testResult ? <VerificationResult result={testResult} /> : null}

      <div className="flex flex-col items-stretch gap-2 pt-1 md:flex-row md:items-center md:justify-between">
        <Button
          data-tutorial-target="test-database-source"
          variant="outline"
          onClick={handleTest}
          disabled={pending !== undefined}
        >
          {pending === 'test' ? 'Testing…' : 'Test connection'}
        </Button>
        <div className="grid grid-cols-2 items-center gap-2 md:flex">
          <Button variant="ghost" disabled={pending !== undefined} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            data-tutorial-target="save-database-source"
            type="submit"
            disabled={pending !== undefined}
          >
            {pending === 'save' ? 'Saving…' : mode === 'create' ? 'Save service' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
  );
}
