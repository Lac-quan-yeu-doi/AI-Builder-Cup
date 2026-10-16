'use client';

import type { FormEvent } from 'react';

import { Button } from '@/app/_components/ui/button';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { TextField } from '@/app/_components/ui/fields';
import { Spinner } from '@/app/_components/ui/spinner';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { CreateSkillInput, SkillDetail } from '@/src/entities/models/skill';

import { SkillIndexPreview } from './skill-index-preview';
import { SkillMarkdownEditor } from './skill-markdown-editor';

/** The footer's submit button sits outside the form, so it associates by id. */
const SKILL_FORM_ID = 'skill-form';

export type SkillFormValues = CreateSkillInput;
export type SkillFieldErrors = Partial<Record<keyof SkillFormValues, string>>;

export interface SkillDetailPaneProps {
  readonly mode: 'view' | 'create';
  readonly detail: SkillDetail | null;
  readonly form: SkillFormValues;
  readonly fieldErrors: SkillFieldErrors;
  readonly editable: boolean;
  readonly busy: boolean;
  readonly saving: boolean;
  readonly deleting: boolean;
  readonly error: string | null;
  readonly notice: string | null;
  readonly onChange: (field: keyof SkillFormValues, value: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onCancel: () => void;
  readonly onRequestDelete: () => void;
  readonly onDismissNotice: () => void;
}

/**
 * The authoring half.
 *
 * Field order follows what the field decides rather than what the struct
 * declares. `description` leads because it is the routing key: the agent reads
 * it to choose the skill, and the body never enters that decision. `name` is
 * only a field while it is still settable — after creation it is the pane's
 * heading, which is both where it belongs and why it can no longer be typed
 * into.
 */
export function SkillDetailPane({
  mode,
  detail,
  form,
  fieldErrors,
  editable,
  busy,
  saving,
  deleting,
  error,
  notice,
  onChange,
  onSubmit,
  onCancel,
  onRequestDelete,
  onDismissNotice,
}: SkillDetailPaneProps) {
  const { t } = useTranslation();
  const creating = mode === 'create';
  const readOnlySource = detail?.source === 'global';
  const bodyLines = form.body.trim().length === 0 ? 0 : form.body.split(/\r?\n/u).length;

  return (
    <div className="flex min-w-0 flex-1 flex-col @[52rem]/skills:min-h-0">
      <form
        className="flex min-w-0 flex-col gap-4 pr-0.5 @[52rem]/skills:min-h-0 @[52rem]/skills:flex-1 @[52rem]/skills:overflow-y-auto"
        id={SKILL_FORM_ID}
        noValidate
        onSubmit={onSubmit}
      >
        {error ? <PageAlert className="shrink-0">{error}</PageAlert> : null}
        {notice ? (
          <PageAlert className="shrink-0" onDismiss={onDismissNotice} tone="success">
            {notice}
          </PageAlert>
        ) : null}
        {readOnlySource ? (
          <PageAlert className="shrink-0" tone="info">
            {t('skills.globalReadOnly')}
          </PageAlert>
        ) : null}

        <div className="grid min-w-0 shrink-0 gap-3" data-skill-metadata>
          {creating ? (
            <TextField
              autoComplete="off"
              className="gap-1.5"
              error={fieldErrors.name}
              hint={t('skills.nameHint')}
              label={t('skills.name')}
              onChange={(event) => onChange('name', event.target.value)}
              required
              spellCheck={false}
              value={form.name}
            />
          ) : null}

          <TextField
            className="gap-1.5"
            disabled={!editable || busy}
            error={fieldErrors.description}
            hint={t('skills.descriptionHint')}
            label={t('skills.description')}
            onChange={(event) => onChange('description', event.target.value)}
            value={form.description}
          />

          {/* The index line the description will become, composed exactly as the
           * agent composes it. This is the hint that cannot be misread. */}
          <SkillIndexPreview
            description={form.description}
            name={creating ? form.name : (detail?.name ?? form.name)}
          />

          <TextField
            className="gap-1.5"
            disabled={!editable || busy}
            error={fieldErrors.namespace}
            hint={t('skills.namespaceHint')}
            label={t('skills.namespace')}
            onChange={(event) => onChange('namespace', event.target.value)}
            value={form.namespace}
          />
        </div>

        <SkillMarkdownEditor
          body={form.body}
          busy={busy}
          documentId={`${mode}:${detail?.name ?? 'new-skill'}`}
          editable={editable}
          formatLabel={t('skills.markdown')}
          hint={t('skills.bodyHint')}
          label={t('skills.body')}
          onChange={(body) => onChange('body', body)}
          statsLabel={t('skills.bodyStatsValue', {
            lines: bodyLines,
            characters: form.body.length,
          })}
        />
      </form>

      {/* A footer beside the scrolling form, not a sticky strip inside it. The
       * strip used `-mx-6` to bleed to the card edge, which made the form 22px
       * wider than its own content box at every width — that was the horizontal
       * scrollbar. It also sat on `mt-auto`, so once the editor's min-height
       * overflowed the form the bar detached and landed mid-content.
       *
       * It stays sticky: when the panes stack, the column above is what scrolls
       * and Save has to stay reachable. Split, the flex layout already pins it
       * and the sticky does nothing. */}
      {editable ? (
        <div className="sticky bottom-0 mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-card pt-4 pb-4">
          {creating ? (
            <Button disabled={busy} onClick={onCancel} type="button" variant="outline">
              {t('action.cancel')}
            </Button>
          ) : (
            <Button
              aria-busy={deleting || undefined}
              disabled={busy}
              onClick={onRequestDelete}
              type="button"
              variant="destructive-ghost"
            >
              {deleting ? <Spinner aria-hidden="true" /> : null}
              {deleting ? t('skills.deleting') : t('skills.delete')}
            </Button>
          )}
          <Button
            aria-busy={saving || undefined}
            disabled={busy}
            form={SKILL_FORM_ID}
            type="submit"
          >
            {saving ? <Spinner aria-hidden="true" /> : null}
            {creating
              ? saving
                ? t('skills.creating')
                : t('skills.createAction')
              : saving
                ? t('skills.saving')
                : t('action.save')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
