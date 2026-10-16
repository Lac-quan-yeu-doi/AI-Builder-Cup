'use client';

import { useState, type FormEvent } from 'react';

import type {
  CdcConnectionProfileInput,
  CdcConnectionSetupMode,
} from '@/src/entities/models/database-service';
import type { CdcConnectionProfileViewModel } from '@/src/interface-adapters/presenters/database-service.presenter';
import { contextualErrorMessage } from '@/app/_components/shared/error-message';
import { Button } from '@/app/_components/ui/button';
import { Checkbox } from '@/app/_components/ui/checkbox';
import { Field, FieldLabel } from '@/app/_components/ui/field';
import { PasswordField, SelectField, TextField } from '@/app/_components/ui/fields';
import { InlineError } from '@/app/_components/ui/page-alert';
import { RadioGroupField } from '@/app/_components/ui/radio-group-field';
import { useTranslation } from '@/app/_i18n/use-translation';

interface CdcConnectionFormProps {
  readonly connectorType: string;
  readonly initialProfile?: CdcConnectionProfileViewModel;
  readonly onCancel: () => void;
  readonly onSave: (input: CdcConnectionProfileInput) => Promise<void>;
}

const POSTGRESQL = 'POSTGRESQL';
type ConnectionInputMode = 'url' | 'structured';

export function CdcConnectionForm({
  connectorType,
  initialProfile,
  onCancel,
  onSave,
}: CdcConnectionFormProps) {
  const { t } = useTranslation();
  const isPostgresql = connectorType === POSTGRESQL;
  const [setupMode, setSetupMode] = useState<CdcConnectionSetupMode>(
    initialProfile?.setupMode ?? 'existing',
  );
  const [connectionInputMode, setConnectionInputMode] = useState<ConnectionInputMode>('url');
  const [connectionUrl, setConnectionUrl] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(isPostgresql ? '5432' : '3306');
  const [databaseName, setDatabaseName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sslMode, setSslMode] = useState(isPostgresql ? 'require' : 'REQUIRED');
  const [publicationName, setPublicationName] = useState(initialProfile?.publicationName ?? '');
  const [slotName, setSlotName] = useState(initialProfile?.slotName ?? '');
  const [managedConsent, setManagedConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting || (setupMode === 'managed' && !managedConsent)) return;

    setSubmitting(true);
    setFailure(undefined);
    const input: CdcConnectionProfileInput = {
      setupMode,
      details:
        connectionInputMode === 'url'
          ? { connectionUrl: connectionUrl.trim() }
          : {
              host: host.trim(),
              port: Number(port),
              databaseName: databaseName.trim(),
              username: username.trim(),
              password,
              sslMode,
            },
      ...(isPostgresql && publicationName.trim()
        ? { publicationName: publicationName.trim() }
        : {}),
      ...(isPostgresql && slotName.trim() ? { slotName: slotName.trim() } : {}),
    };

    try {
      await onSave(input);
      setConnectionUrl('');
      setPassword('');
    } catch (error) {
      setFailure(contextualErrorMessage(error, t('source.cdc.saveError')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <RadioGroupField
        data={[
          { label: t('source.cdc.existing'), value: 'existing' },
          { label: t('source.cdc.managed'), value: 'managed' },
        ]}
        hint={setupMode === 'existing' ? t('source.cdc.existingHint') : t('source.cdc.managedHint')}
        onChange={(value) => {
          setSetupMode(value as CdcConnectionSetupMode);
          setManagedConsent(false);
        }}
        value={setupMode}
      />

      <RadioGroupField
        data={[
          { label: t('source.cdc.connectionString'), value: 'url' },
          { label: t('source.cdc.manualFields'), value: 'structured' },
        ]}
        hint={
          connectionInputMode === 'url'
            ? t('source.cdc.connectionStringHint')
            : t('source.cdc.manualFieldsHint')
        }
        label={t('source.cdc.connectionInput')}
        onChange={(value) => setConnectionInputMode(value as ConnectionInputMode)}
        value={connectionInputMode}
      />

      {connectionInputMode === 'url' ? (
        <PasswordField
          autoComplete="new-password"
          inputClassName="font-mono"
          label={t('source.cdc.connectionUrl')}
          onChange={(event) => setConnectionUrl(event.currentTarget.value)}
          placeholder={
            isPostgresql
              ? 'postgresql://user:password@host:5432/database?sslmode=require'
              : 'mysql://user:password@host:3306/database'
          }
          required
          spellCheck={false}
          value={connectionUrl}
        />
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <TextField
              label={t('source.cdc.host')}
              onChange={(event) => setHost(event.currentTarget.value)}
              required
              value={host}
            />
            <TextField
              inputMode="numeric"
              label={t('source.cdc.port')}
              min="1"
              max="65535"
              onChange={(event) => setPort(event.currentTarget.value)}
              required
              type="number"
              value={port}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('source.cdc.database')}
              onChange={(event) => setDatabaseName(event.currentTarget.value)}
              required
              value={databaseName}
            />
            <TextField
              autoComplete="username"
              label={t('source.cdc.username')}
              onChange={(event) => setUsername(event.currentTarget.value)}
              required
              value={username}
            />
          </div>
          <PasswordField
            autoComplete="new-password"
            label={t('source.cdc.password')}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            value={password}
          />
          <SelectField
            data={
              isPostgresql
                ? ['disable', 'prefer', 'require', 'verify-ca', 'verify-full']
                : ['DISABLED', 'PREFERRED', 'REQUIRED', 'VERIFY_CA', 'VERIFY_IDENTITY']
            }
            label={t('source.cdc.sslMode')}
            onChange={setSslMode}
            value={sslMode}
          />
        </div>
      )}

      {isPostgresql && setupMode === 'existing' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('source.cdc.publication')}
            onChange={(event) => setPublicationName(event.currentTarget.value)}
            required
            value={publicationName}
          />
          <TextField
            label={t('source.cdc.slot')}
            onChange={(event) => setSlotName(event.currentTarget.value)}
            required
            value={slotName}
          />
        </div>
      ) : null}

      {setupMode === 'managed' ? (
        <Field orientation="horizontal">
          <Checkbox
            checked={managedConsent}
            id="cdc-managed-consent"
            onCheckedChange={(checked) => setManagedConsent(checked === true)}
          />
          <FieldLabel className="font-normal" htmlFor="cdc-managed-consent">
            {t('source.cdc.managedConsent')}
          </FieldLabel>
        </Field>
      ) : null}

      {failure ? <InlineError>{failure}</InlineError> : null}
      <div className="flex justify-end gap-2">
        <Button disabled={submitting} onClick={onCancel} type="button" variant="outline">
          {t('source.cdc.cancel')}
        </Button>
        <Button disabled={submitting || (setupMode === 'managed' && !managedConsent)} type="submit">
          {t('source.cdc.save')}
        </Button>
      </div>
    </form>
  );
}
